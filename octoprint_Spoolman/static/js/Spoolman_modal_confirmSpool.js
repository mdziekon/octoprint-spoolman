$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

    const SpoolmanModalConfirmSpoolComponent = {
        registerComponent: () => {
            ko.components.register('spoolman-modal-confirm-spool', {
                viewModel: SpoolmanModalConfirmSpoolViewModel,
                template: {
                    element: 'spoolman-modal-confirmSpool-template',
                },
            });
        },
        modalSelector: "#spoolman_modal_confirmspool",
    }

    window.SpoolmanModalConfirmSpoolComponent = SpoolmanModalConfirmSpoolComponent;

    /**
     * Events:
     * - onConfirm
     * - onHidden
     *
     * @param {*} params
     */
    function SpoolmanModalConfirmSpoolViewModel(params) {
        const self = this;

        self.settingsViewModel = params.settingsViewModel;
        self.eventsSink = params.eventsSink;

        self._isVisible = false;
        self._isSelfInvalidatingCache = false;

        self.modals = {
            confirmSpool: $(SpoolmanModalConfirmSpoolComponent.modalSelector),
        };

        const getPluginSettings = () => {
            return self.settingsViewModel().settings.plugins[PLUGIN_ID];
        };

        const refreshModalLayout = () => {
            self.modals.confirmSpool.modal("layout");
        };

        const refreshView = async () => {
            if (!self._isVisible) {
                return;
            }

            self.templateData.detectedProblems([]);
            self.templateData.selectedSpoolsByToolIdx([]);
            self.templateData.loadingError(undefined);
            self.templateData.isLoadingData(true);

            refreshModalLayout();

            const [
                currentJobRequirementsResult,
                spoolmanSpoolsResult,
            ] = await Promise.all([
                pluginSpoolmanApi.getCurrentJobRequirements(),
                pluginSpoolmanApi.getSpoolmanSpools(),
            ]);

            self.templateData.isLoadingData(false);

            if (
                !currentJobRequirementsResult.isSuccess ||
                !spoolmanSpoolsResult.isSuccess
            ) {
                const error = (
                    !currentJobRequirementsResult.isSuccess
                        ? currentJobRequirementsResult.error.response.error
                        : spoolmanSpoolsResult.error.response.error
                );

                self.templateData.loadingError(error);

                return;
            }

            const spoolmanSpools = spoolmanSpoolsResult.payload.response.data.spools;
            const currentJobRequirements = currentJobRequirementsResult.payload.response.data;

            if (!currentJobRequirements.isFilamentUsageAvailable) {
                const detectedProblems = [ self.constants.filament_problems.NO_FILAMENT_USAGE_DATA ];

                self.templateData.detectedProblems(detectedProblems);
                self.templateData.detectedProblems.valueHasMutated();

                refreshModalLayout();

                return;
            }

            const currentProfileData = self.settingsViewModel().printerProfiles.currentProfileData();
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
                const safeSpool = spoolData && toSafeSpool(spoolData);
                const spoolDisplayData = spoolData && toSpoolForDisplay(spoolData, { constants: self.constants });
                const toolFilamentUsage = currentJobRequirements.tools[extruderIdx];

                if (
                    !toolFilamentUsage ||
                    toolFilamentUsage.filamentLength === 0
                ) {
                    return {
                        spoolId,
                        spoolData,
                        spoolDisplayData,
                        isSpoolValid: safeSpool?.isSpoolValid,
                        /** @type false */
                        isToolInUse: false,
                        isToolMissingSelection: undefined,
                        filamentUsage: undefined,
                    };
                }

                const isToolMissingSelection = !toolFilamentUsage.spoolId;

                const isEnoughFilamentAvailable = (
                    !isToolMissingSelection &&
                    safeSpool &&
                    safeSpool.isSpoolValid
                )
                    ? toolFilamentUsage.filamentWeight <= safeSpool.spoolData.remaining_weight
                    : undefined;

                return {
                    spoolId,
                    spoolData: safeSpool && safeSpool.spoolData,
                    spoolDisplayData,
                    isSpoolValid: safeSpool?.isSpoolValid,
                    /** @type true */
                    isToolInUse: true,
                    isToolMissingSelection,
                    filamentUsage: {
                        length: toolFilamentUsage.filamentLength,
                        weight: toolFilamentUsage.filamentWeight,
                        isEnough: isEnoughFilamentAvailable,
                    },
                };
            });

            const detectedProblems = [
                (
                    selectedSpools.some((spool) => {
                        return (
                            spool.isToolInUse &&
                            spool.filamentUsage.isEnough === false
                        );
                    })
                        ? self.constants.filament_problems.NOT_ENOUGH_FILAMENT
                        : undefined
                ),
                (
                    selectedSpools.some((spool) => {
                        return (
                            spool.isToolInUse &&
                            spool.isSpoolValid === false
                        );
                    })
                        ? self.constants.filament_problems.INVALID_SPOOL
                        : undefined
                ),
                (
                    selectedSpools.some((spool) => spool.isToolMissingSelection === true)
                        ? self.constants.filament_problems.MISSING_SPOOL_SELECTION
                        : undefined
                ),
                (
                    Object.values(currentJobRequirements.tools).length > selectedSpools.length
                        ? self.constants.filament_problems.TOOLS_COUNT_MISMATCH
                        : undefined
                ),
            ].filter((value) => Boolean(value));

            self.templateData.detectedProblems(detectedProblems);
            self.templateData.detectedProblems.valueHasMutated();

            self.templateData.selectedSpoolsByToolIdx(selectedSpools);
            self.templateData.selectedSpoolsByToolIdx.valueHasMutated();

            refreshModalLayout();
        };

        const handleDisplayModal = async () => {
            await refreshView();
        };

        const handleStartPrint = async () => {
            // TODO (Feature): apply temperature overrides

            self.eventsSink({
                type: 'onConfirm',
            });

            self.modals.confirmSpool.modal("hide");
        };

        const handleForceRefresh = async () => {
            pluginSpoolmanApi.getSpoolmanSpools.invalidate();
        };

        const handleTryAgainOnError = async () => {
            await handleForceRefresh();
        };

        /** Bindings for the template */
        self.constants = {
            weight_unit: 'g',
            length_unit: 'mm',

            filament_problems: {
                INVALID_SPOOL: 'INVALID_SPOOL',
                NO_FILAMENT_USAGE_DATA: 'NO_FILAMENT_USAGE_DATA',
                NOT_ENOUGH_FILAMENT: 'NOT_ENOUGH_FILAMENT',
                MISSING_SPOOL_SELECTION: 'MISSING_SPOOL_SELECTION',
                TOOLS_COUNT_MISMATCH: 'TOOLS_COUNT_MISMATCH',
            },
        };
        self.templateApi = {
            handleStartPrint,
            handleTryAgainOnError,
            handleForceRefresh,
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            loadingError: ko.observable(undefined),

            detectedProblems: ko.observable([]),
            selectedSpoolsByToolIdx: ko.observable([]),
        };
        /** -- end of bindings -- */

        $(document).on("shown", SpoolmanModalConfirmSpoolComponent.modalSelector, async () => {
            self._isVisible = true;

            self._isSelfInvalidatingCache = true;

            try {
                /**
                 * getCurrentJobRequirements() always fetches latest spool data,
                 * so to keep in sync, we should invalidate cached spools.
                 * TODO: improve this to prevent cache invalidation.
                 */
                await handleForceRefresh();
            } finally {
                self._isSelfInvalidatingCache = false;
            }

            await handleDisplayModal();
        });
        $(document).on("hidden", SpoolmanModalConfirmSpoolComponent.modalSelector, async () => {
            self._isVisible = false;

            self.templateData.detectedProblems([]);
            self.templateData.selectedSpoolsByToolIdx([]);
            self.templateData.loadingError(undefined);
            self.templateData.isLoadingData(true);

            self.eventsSink({
                type: 'onHidden',
            });
        });

        const init = () => {
            pluginSpoolmanApi.cache.onResourcesInvalidated([ "getSpoolmanSpools" ], () => {
                if (self._isSelfInvalidatingCache) {
                    return;
                }

                void refreshView();
            });
        };

        init();
    };
});
