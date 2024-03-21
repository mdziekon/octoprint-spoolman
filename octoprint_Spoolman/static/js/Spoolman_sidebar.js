$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

    function SpoolmanSidebarViewModel(params) {
        const self = this;

        const previousSettings = {
            spoolmanUrl: undefined,
        };

        self.settingsViewModel = params[0];

        self.modals = {
            selectSpool: () => $(SpoolmanModalSelectSpoolComponent.modalSelector),
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
                self.templateData.loadingError(spoolmanSpoolsResult.error.response.error)

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

                return spoolmanSpools.find((spool) => String(spool.id) === spoolId);
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
                    shouldAutoclose: false,
                    shouldShowType: true,
                });

                // Note: cleanup state
                if (spoolToolIdx !== undefined) {
                    await handleDeselectSpool(spoolToolIdx);
                }
            }

            return await handleForceRefresh();
        };

        const handlePluginSocketEvents = async (eventType, eventPayload) => {
            if (eventType === "plugin_Spoolman_spool_selected") {
                return;
            }
            if (eventType === "plugin_Spoolman_spool_usage_comitted") {
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
            },
        };
        /** -- end of bindings -- */

        self.onBeforeBinding = () => {
            SpoolmanModalSelectSpoolComponent.registerComponent();

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
            "settingsViewModel"
        ],
        elements: [
            document.querySelector("#sidebar_spoolman"),
            document.querySelector("#spoolman-modals"),
        ]
    });
});
