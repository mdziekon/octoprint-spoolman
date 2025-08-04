$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

    const SpoolmanModalSelectSpoolComponent = {
        registerComponent: () => {
            ko.components.register('spoolman-modal-select-spool', {
                viewModel: SpoolmanModalSelectSpoolViewModel,
                template: {
                    element: 'spoolman-modal-selectSpool-template',
                },
            });
        },
        modalSelector: "#spoolman_modal_selectspool",
    }

    window.SpoolmanModalSelectSpoolComponent = SpoolmanModalSelectSpoolComponent;

    // TODO: Add support for multi-targetting
    function SpoolmanModalSelectSpoolViewModel(params) {
        const self = this;

        self.settingsViewModel = params.settingsViewModel;
        self.eventsSink = params.eventsSink;

        self._isVisible = false;

        self.modals = {
            selectSpool: $(SpoolmanModalSelectSpoolComponent.modalSelector),
        };

        const getPluginSettings = () => {
            return self.settingsViewModel().settings.plugins[PLUGIN_ID];
        };

        const refreshModalLayout = () => {
            self.modals.selectSpool.modal("layout");
        };

        const refreshView = async () => {
            if (!self._isVisible) {
                return;
            }

            // TODO: Add error handling for modal

            const toolIdx = self.templateData.toolIdx();

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

            const selectedSpoolIds = getPluginSettings().selectedSpoolIds;
            const toolSpoolId = selectedSpoolIds[toolIdx]?.spoolId();
            const toolSpool = spoolmanSpools.find((spool) => {
                return String(spool.id) === toolSpoolId;
            });

            const spoolmanSafeSpools = spoolmanSpools.map((spool) => {
                return {
                    ...toSafeSpool(spool),
                    displayData: toSpoolForDisplay(spool, { constants: self.constants }),
                };
            });

            self.templateData.toolCurrentSpoolId(toolSpoolId);
            self.templateData.toolCurrentSpool(
                toolSpool
                    ? {
                        ...toSafeSpool(toolSpool),
                        displayData: toSpoolForDisplay(toolSpool, { constants: self.constants }),
                    }
                    : undefined
            );
            self.templateData.tableItemsOnCurrentPage(spoolmanSafeSpools);

            self.templateData.spoolmanUrl(getPluginSettings().spoolmanUrl());

            self.templateData.tableAttributeVisibility.lot(Boolean(getPluginSettings().showLotNumberColumnInSpoolSelectModal()));

            refreshModalLayout();
        };

        /**
         * @param {number} toolIdx
         */
        const handleDisplayModal = async (toolIdx) => {
            self.templateData.toolIdx(toolIdx);

            await refreshView();
        };

        /**
         * @param {number} toolIdx
         * @param {number} spoolId
         */
        const handleSelectSpoolForTool = async (toolIdx, spoolId) => {
            const request = await pluginSpoolmanApi.updateActiveSpool({ toolIdx, spoolId });

            // TODO: Add error handling for modal
            if (!request.isSuccess) {
                return;
            }

            await reloadSettingsViewModel(self.settingsViewModel());

            self.modals.selectSpool.modal("hide");

            self.eventsSink({
                type: 'onSelectSpoolForTool',
            });
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
            handleSelectSpoolForTool,
            handleTryAgainOnError,
            handleForceRefresh,
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            loadingError: ko.observable(undefined),

            toolIdx: ko.observable(undefined),
            toolCurrentSpoolId: ko.observable(undefined),
            toolCurrentSpool: ko.observable(undefined),

            searchFilter: ko.observable(""),

            tableAttributeVisibility: {
                id: true,
                spoolName: true,
                material: true,
                lot: ko.observable(Boolean(getPluginSettings().showLotNumberColumnInSpoolSelectModal())),
                weight: true,
            },
            tableItemsOnCurrentPage: ko.observable([]),
            // Computed value, needs to be defined once `self.templateData` already exists
            filteredTableItemsOnCurrentPage: undefined,

            spoolmanUrl: ko.observable(undefined),
        };

        self.templateData.filteredTableItemsOnCurrentPage = ko.computed(function () {
            if (!self.templateData) {
                return ko.observable([]);
            }

            const filterTerm = self.templateData.searchFilter().toLowerCase();
            const items = self.templateData.tableItemsOnCurrentPage();

            const filterTermParts = filterTerm
                .split(" ")
                .map((subTerm) => {
                    return subTerm.trim();
                })
                .filter((subTerm) => {
                    return subTerm.length > 0;
                })

            if (!filterTermParts.length) {
                return items;
            }

            return items.filter((item) => {
                const spoolData = item.spoolData;

                // Each termPart must match
                return filterTermParts.every((filterTermPart) => {
                    if (spoolData.id.toString().includes(filterTermPart)) {
                        return true;
                    }
                    if ((spoolData.filament.name ?? "").toLowerCase().includes(filterTermPart)) {
                        return true;
                    }
                    if ((spoolData.filament.material ?? "").toLowerCase().includes(filterTermPart)) {
                        return true;
                    }
                    if ((spoolData.filament?.vendor?.name ?? "").toLowerCase().includes(filterTermPart)) {
                        return true;
                    }
                    if ((spoolData.lot_nr ?? "").toLowerCase().includes(filterTermPart)) {
                        return true;
                    }

                    return false;
                });
            });
        }, self.templateData)
        /** -- end of bindings -- */

        self.templateData.filteredTableItemsOnCurrentPage.subscribe(() => {
            // Refresh modal layout after we're done with rendering
            setTimeout(() => {
                refreshModalLayout();
            }, 100);
        });

        $(document).on("shown", SpoolmanModalSelectSpoolComponent.modalSelector, async () => {
            this._isVisible = true;

            await handleDisplayModal(params.toolIdx());
        });
        $(document).on("hidden", SpoolmanModalSelectSpoolComponent.modalSelector, async () => {
            this._isVisible = false;
        });

        const init = () => {
            pluginSpoolmanApi.cache.onResourcesInvalidated([ "getSpoolmanSpools" ], () => {
                void refreshView();
            });
        };

        init();
    };
});
