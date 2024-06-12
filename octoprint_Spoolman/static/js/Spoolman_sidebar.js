$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

    function SpoolmanSidebarViewModel(params) {
        const self = this;

        const previousSettings = {
            spoolmanUrl: undefined,
        };

        self.settingsViewModel = params[0];
        self.printerStateViewModel = params[1];
        self.filesViewModel = params[2];

        self.printerStateViewModel.filamentWithWeight = ko.observableArray([]);

        self.modals = {
            selectSpool: () => $(SpoolmanModalSelectSpoolComponent.modalSelector),
            confirmSpool: () => $(SpoolmanModalConfirmSpoolComponent.modalSelector),
        };

        const getPluginSettings = () => {
            return self.settingsViewModel.settings.plugins[PLUGIN_ID];
        };

        const initView = async () => {
            updateSelectedSpools();
        };

        /**
         * TODO: Consider moving this to somewhere even more generic?
         * This is not inherently tied to the Sidebar, but since Sidebar is "always present"
         * it acts like that "generic place" for now.
         */
        const initSocket = async () => {
            OctoPrint.socket.onMessage("event", (message) => {
                if (!(message.data.type || '').includes("plugin_Spoolman_")) {
                    return;
                }

                handlePluginSocketEvents(message.data.type, message.data.payload);
            });
        };

        const updateSelectedSpools = async () => {
            self.templateData.loadingError(undefined);
            self.templateData.isLoadingData(true);

            const spoolmanSpoolsResult = await pluginSpoolmanApi.getSpoolmanSpools();

            self.templateData.isLoadingData(false);

            if (!spoolmanSpoolsResult.isSuccess) {
                const responseError = spoolmanSpoolsResult.error.response.error;

                const code = Object.values(self.constants.knownErrors).includes(responseError?.code)
                    ? responseError?.code
                    : undefined;

                self.templateData.loadingError({
                    code,
                })

                return;
            }

            const spoolmanSpools = spoolmanSpoolsResult.payload.response.data.spools;

            const currentProfileData = self.settingsViewModel.printerProfiles.currentProfileData();
            const currentExtrudersCount = (
                currentProfileData
                    ? currentProfileData.extruder.count()
                    : 0
            );

            const extruders = Array.from({
                length: currentExtrudersCount
            }, () => undefined)

            const selectedSpoolIds = getPluginSettings().selectedSpoolIds;
            const selectedSpools = extruders.map((_, extruderIdx) => {
                const spoolId = selectedSpoolIds[extruderIdx]?.spoolId();

                const spoolData = spoolmanSpools.find((spool) => String(spool.id) === spoolId);

                return {
                    spoolId,
                    spoolData,
                    spoolDisplayData: spoolData && toSpoolForDisplay(spoolData, { constants: self.constants }),
                };
            });

            self.templateData.selectedSpoolsByToolIdx(selectedSpools);
            self.templateData.selectedSpoolsByToolIdx.valueHasMutated();

            self.templateData.spoolmanUrl(getPluginSettings().spoolmanUrl());
        };

        /**
         * @param {number} toolIdx
         */
        const handleOpenSpoolSelector = async (toolIdx) => {
            self.templateData.modals.selectSpool.toolIdx(toolIdx);

            self.modals.selectSpool().modal("show");
        };

        const handleOpenSpoolConfirmation = async () => {
            self.modals.confirmSpool().modal("show");
        };

        /**
         * @param {number} toolIdx
         */
        const handleDeselectSpool = async (toolIdx) => {
            const request = await pluginSpoolmanApi.updateActiveSpool({ toolIdx, spoolId: undefined });

            // TODO: Add error handling for modal
            if (!request.isSuccess) {
                return;
            }

            await reloadSettingsViewModel(self.settingsViewModel);

            updateSelectedSpools();
        };

        const handleForceRefresh = async () => {
            pluginSpoolmanApi.getSpoolmanSpools.invalidate();
        };
        const handleTryAgainOnError = async () => {
            await handleForceRefresh();
        };
        const handleSpoolUsageError = async (eventPayload) => {
            if (eventPayload.code === "spoolman_api__spool_not_found") {
                const spoolId = eventPayload.data.spoolId;
                const selectedSpoolIds = getPluginSettings().selectedSpoolIds;

                const spoolTool = Object.entries(selectedSpoolIds)
                    .find(([ toolIdx, toolProps ]) => toolProps.spoolId() === spoolId);
                const [ spoolToolIdx ] = spoolTool ?? [ undefined ];

                const spoolUsedLength = eventPayload.data.usedLength;

                showSpoolmanPopup({
                    type: 'error',
                    subject: 'Spool no longer exists',
                    message: `
                        The previously selected spool ${spoolToolIdx !== undefined ? `for tool #${spoolToolIdx} (spool #${spoolId}) ` : `#${spoolId}`} seems to no longer exist in Spoolman's database.
                        Spool used length of ${(spoolUsedLength ?? 0).toFixed(1)}${self.constants.length_unit} has been discarded.
                        The spool has been deselected.
                    `,
                    shouldDeduplicate: false,
                    shouldAutoclose: false,
                    shouldShowType: true,
                });

                // Note: cleanup state
                if (spoolToolIdx !== undefined) {
                    await handleDeselectSpool(spoolToolIdx);
                    await handleForceRefresh();
                }

                return;
            }

            showSpoolmanPopup({
                type: 'error',
                subject: 'Unknown error while committing usage',
                message: `
                    There was an unknown error while committing usage to Spoolman.
                    Spool usage update has been lost...
                `,
                shouldDeduplicate: false,
                shouldAutoclose: false,
                shouldShowType: true,
            });
        };

        const handlePluginSocketEvents = async (eventType, eventPayload) => {
            if (eventType === "plugin_Spoolman_spool_selected") {
                return;
            }
            if (eventType === "plugin_Spoolman_spool_usage_committed") {
                return await handleForceRefresh();
            }
            if (eventType === "plugin_Spoolman_spool_usage_error") {
                return await handleSpoolUsageError(eventPayload);
            }

            console.warn(`[Spoolman][event] Unknown plugin event "${eventType}"`);
        };

        /** Bindings for the template */
        self.constants = {
            weight_unit: 'g',
            length_unit: 'mm',

            knownErrors: {
                SPOOLMAN_API__INSTANCE_URL_EMPTY: 'spoolman_api__instance_url_empty',
                SPOOLMAN_API__CONNECTION_TIMEOUT: 'spoolman_api__connection_timeout',
                SPOOLMAN_API__CONNECTION_FAILED: 'spoolman_api__connection_failed',
                SPOOLMAN_API__SSL_ERROR: 'spoolman_api__ssl_error',
            },
        };
        self.templateApi = {
            handleOpenSpoolSelector,
            handleDeselectSpool,
            handleTryAgainOnError,
            handleForceRefresh,
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            loadingError: ko.observable(undefined),
            selectedSpoolsByToolIdx: ko.observable([]),
            spoolmanUrl: ko.observable(undefined),

            settingsViewModel: ko.observable(undefined),

            modals: {
                selectSpool: {
                    toolIdx: ko.observable(undefined),
                    eventsSink: ko.observable(),
                },
                confirmSpool: {
                    eventsSink: ko.observable(),
                },
            },
        };
        /** -- end of bindings -- */

        const monkeypatchOctoprintUI = () => {
            const origStartPrintFunction = self.printerStateViewModel.print;
            const origLoadAndPrintFunction = self.filesViewModel.loadFile;

            let suppressStartPrintConfirmSpoolsSelection = false;

            const newStartPrintFunction = function confirmSpoolsBeforeStartPrint() {
                const shouldConfirmSpoolsSelection = Boolean(getPluginSettings().isPreprintSpoolVerifyEnabled());

                if (
                    !shouldConfirmSpoolsSelection ||
                    suppressStartPrintConfirmSpoolsSelection
                ) {
                    return origStartPrintFunction();
                }

                handleOpenSpoolConfirmation();

                const subscription = self.templateData.modals.confirmSpool.eventsSink.subscribe((newEvent) => {
                    if (newEvent.type === 'onConfirm') {
                        origStartPrintFunction();
                    }

                    subscription.dispose();
                });
            };
            /**
             * Note: this implementation always pre-selects the file, even though the outcome
             * of the confirmation modal might be "negative" (user cancels the print intent).
             *
             * This is a trade-off between using the default load&print implementation "as-is"
             * or reimplementing it here.
             */
            const newLoadAndPrintFunction = function confirmSpoolsBeforeLoadAndPrint(...args) {
                const [ data, printAfterLoad, ...restArgs ] = args;

                const shouldConfirmSpoolsSelection = Boolean(getPluginSettings().isPreprintSpoolVerifyEnabled());

                if (!shouldConfirmSpoolsSelection || !printAfterLoad) {
                    return origLoadAndPrintFunction(...args);
                }

                origLoadAndPrintFunction(data, false, ...restArgs);

                handleOpenSpoolConfirmation();

                const subscription = self.templateData.modals.confirmSpool.eventsSink.subscribe((newEvent) => {
                    if (newEvent.type === 'onConfirm') {
                        suppressStartPrintConfirmSpoolsSelection = true;

                        origLoadAndPrintFunction(...args);
                    }

                    suppressStartPrintConfirmSpoolsSelection = false;

                    subscription.dispose();
                });
            };

            self.printerStateViewModel.print = newStartPrintFunction;
            self.filesViewModel.loadFile = newLoadAndPrintFunction;

            self.printerStateViewModel.formatFilamentWithWeight = function(filament) {
                if (!filament) {
                    return "-";
                };
                if (filament.weight === undefined) {
                    return `${filament.length.toFixed(1)}mm`
                }
                return `${filament.length.toFixed(1)}mm / ${filament.weight.toFixed(1)}g`
            }
        };

        // lifted straight from filamentmanager
        self.replaceFilamentView = function replaceFilamentViewInSidebar() {
            $('#state').find('.accordion-inner').contents().each((index, item) => {
                if (item.nodeType === Node.COMMENT_NODE) {
                    if (item.nodeValue === ' ko foreach: filament ') {
                        item.nodeValue = ' ko foreach: [] '; // eslint-disable-line no-param-reassign
                        const element = '<!-- ko foreach: filamentWithWeight --> <span data-bind="text: \'Filament (\' + name() + \'): \', title: \'Filament usage for \' + name()"></span><strong data-bind="text: $root.formatFilamentWithWeight(data())"></strong><br> <!-- /ko -->';
                        $(element).insertBefore(item);
                        return false; // exit loop
                    }
                }
                return true;
            });
        };

        self.onStartup = () => {
            self.replaceFilamentView();
        }

        let filename;

        const calculateWeight = function calculateFilamentWeight(length, diameter, density) {
            const radius = diameter / 2;
            const volume = (length * Math.PI * radius * radius) / 1000;
            return volume * density;
        };
        self.printerStateViewModel.filamentWithWeight = ko.computed(function updateFilamentWeightAndCheckRemainingFilament() {
    
            const filament = self.printerStateViewModel.filament();
            const spools = self.templateData.selectedSpoolsByToolIdx()

            const filamentWithWeight = [];
            for (let i = 0; i < filament.length; i++) {
                const spool = spools[i]
                const fil = filament[i]
                let weight;
                const length = fil.data().length;
                if(spool && spool.spoolData) {
                    weight = calculateWeight(length, spool.spoolData.filament.diameter, spool.spoolData.filament.density);
                }
                const newFilament = {
                    name: fil.name,
                    data: ko.observable({
                        ...fil.data(),
                        weight,
                    })
                }
                filamentWithWeight.push(newFilament)
            }

            return filamentWithWeight;
        });

        self.onBeforeBinding = () => {
            SpoolmanModalSelectSpoolComponent.registerComponent();
            SpoolmanModalConfirmSpoolComponent.registerComponent();

            self.templateData.modals.selectSpool.eventsSink.subscribe((newEvent) => {
                if (newEvent.type === 'onSelectSpoolForTool') {
                    updateSelectedSpools();
                }
            });
        };

        self.onAfterBinding = () => {
            self.templateData.settingsViewModel(self.settingsViewModel);

            initView();
            initSocket();
            monkeypatchOctoprintUI();

            previousSettings.spoolmanUrl = getPluginSettings().spoolmanUrl();

            /**
             * Update spools on printer's profile update,
             * to handle any potential tool-count changes.
             */
            self.settingsViewModel.printerProfiles.currentProfileData.subscribe(() => {
                void updateSelectedSpools();
            });

            pluginSpoolmanApi.cache.onResourcesInvalidated([ "getSpoolmanSpools" ], () => {
                void updateSelectedSpools();
            });
        };

        /**
         * Update spools on Spoolman instance change.
         * Subscribing to settings entry is unreliable, as its observable updates
         * on every input change, rather than on save.
         */
        self.onSettingsHidden = () => {
            const newSettings = {
                spoolmanUrl: getPluginSettings().spoolmanUrl(),
            };

            if (previousSettings.spoolmanUrl === newSettings.spoolmanUrl) {
                return;
            }

            previousSettings.spoolmanUrl = newSettings.spoolmanUrl;

            pluginSpoolmanApi.getSpoolmanSpools.invalidate();
        };
    };

    OCTOPRINT_VIEWMODELS.push({
        construct: SpoolmanSidebarViewModel,
        dependencies: [
            "settingsViewModel",
            "printerStateViewModel",
            "filesViewModel",
        ],
        elements: [
            document.querySelector("#sidebar_spoolman"),
            document.querySelector("#spoolman-modals"),
        ]
    });
});
