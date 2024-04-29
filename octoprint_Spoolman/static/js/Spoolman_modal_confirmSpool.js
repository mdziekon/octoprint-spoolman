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
     */
    function SpoolmanModalConfirmSpoolViewModel(params) {
        const self = this;

        self.settingsViewModel = params.settingsViewModel;
        self.eventsSink = params.eventsSink;

        self._isVisible = false;

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

            // TODO: Add filament requirements fetcher
            // TODO: Add error handling for modal

            self.templateData.loadingError(undefined);
            self.templateData.isLoadingData(true);

            refreshModalLayout();

            const spoolmanSpoolsResult = await pluginSpoolmanApi.getSpoolmanSpools();

            self.templateData.isLoadingData(false);

            if (!spoolmanSpoolsResult.isSuccess) {
                self.templateData.loadingError(spoolmanSpoolsResult.error.response.error)

                return;
            }

            const spoolmanSpools = spoolmanSpoolsResult.payload.response.data.spools;

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

                return {
                    spoolId,
                    spoolData,
                };
            });

            self.templateData.selectedSpoolsByToolIdx(selectedSpools);
            self.templateData.selectedSpoolsByToolIdx.valueHasMutated();

            refreshModalLayout();
        };

        const handleDisplayModal = async () => {
            await refreshView();
        };

        const handleStartPrint = async () => {
            // TODO: Perform any pre-checks if necessary

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
        };
        self.templateApi = {
            handleStartPrint,
            handleTryAgainOnError,
            handleForceRefresh,
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            loadingError: ko.observable(undefined),

            selectedSpoolsByToolIdx: ko.observable([]),
        };
        /** -- end of bindings -- */

        $(document).on("shown", SpoolmanModalConfirmSpoolComponent.modalSelector, async () => {
            self._isVisible = true;

            await handleDisplayModal();
        });
        $(document).on("hidden", SpoolmanModalConfirmSpoolComponent.modalSelector, async () => {
            self._isVisible = false;

            self.eventsSink({
                type: 'onHidden',
            });
        });

        const init = () => {
            pluginSpoolmanApi.cache.onResourcesInvalidated([ "getSpoolmanSpools" ], () => {
                void refreshView();
            });
        };

        init();
    };
});
