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
            self.templateData.tableAttributeVisibility.lastUsed(Boolean(getPluginSettings().showLastUsedColumnInSpoolSelectModal()));

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
        /**
         * @param {string} newSortField
         */
        const handleSortChange = (newSortField) => {
            if (self.templateData.sortField() !== newSortField) {
                self.templateData.sortField(newSortField);
                self.templateData.sortDirection('asc');

                return;
            }

            if (self.templateData.sortDirection() === 'asc') {
                self.templateData.sortDirection('desc');
            } else if (self.templateData.sortDirection() === 'desc') {
                self.templateData.sortDirection(null);
                self.templateData.sortField(null);
            } else {
                self.templateData.sortDirection('asc');
                self.templateData.sortField(newSortField);
            }
        };

        /** Bindings for the template */
        self.constants = {
            weight_unit: 'g',
        };
        self.templateApi = {
            handleSelectSpoolForTool,
            handleTryAgainOnError,
            handleForceRefresh,
            handleSortChange,
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            loadingError: ko.observable(undefined),

            toolIdx: ko.observable(undefined),
            toolCurrentSpoolId: ko.observable(undefined),
            toolCurrentSpool: ko.observable(undefined),

            searchFilter: ko.observable(""),
            sortField: ko.observable('id'),
            sortDirection: ko.observable('asc'),

            tableAttributeVisibility: {
                id: true,
                spoolName: true,
                material: true,
                lot: ko.observable(Boolean(getPluginSettings().showLotNumberColumnInSpoolSelectModal())),
                lastUsed: ko.observable(Boolean(getPluginSettings().showLastUsedColumnInSpoolSelectModal())),
                weight: true,
            },
            tableItemsOnCurrentPage: ko.observable([]),
            // Computed value, needs to be defined once `self.templateData` already exists
            computedTableItemsOnCurrentPage: undefined,

            spoolmanUrl: ko.observable(undefined),
        };

        /**
         * @param {*} tableItem
         * @param {string} field
         */
        const getSortValue = (tableItem, field) => {
            switch (field) {
                case 'id':
                    return tableItem.spoolId;
                case 'spoolName':
                    return tableItem.displayData.filament.name.displayValue.toLowerCase();
                case 'material':
                    return tableItem.displayData.filament.material.displayValue.toLowerCase();
                case 'lot':
                    return tableItem.displayData.lot.displayValue.toLowerCase();
                case 'weight':
                    // For weight, use `remaining_weight`
                    return tableItem.displayData.remaining_weight.isValid ?
                        parseFloat(tableItem.displayData.remaining_weight.displayValue) : 0;
                case 'lastUsed':
                    if (!tableItem.spoolData.last_used) {
                        return -1;
                    }

                    return (new Date(tableItem.spoolData.last_used)).getTime();
                default:
                    return '';
            }
        };

        /**
         * @param {*} tableItems
         * @param {string} field
         * @param {'asc' | 'desc' | null} direction
         */
        const sortSpools = (tableItems, field, direction) => {
            if (!field || !direction) {
                return tableItems;
            }

            return [...tableItems].sort((left, right) => {
                const valueA = getSortValue(left, field);
                const valueB = getSortValue(right, field);

                let comparison = 0;

                if (typeof valueA === 'string' && typeof valueB === 'string') {
                    comparison = valueA.localeCompare(valueB);
                } else {
                    comparison = valueA - valueB;
                }

                return direction === 'desc' ? -comparison : comparison;
            });
        };

        /**
         * Filter & sort table items before displaying
         */
        self.templateData.computedTableItemsOnCurrentPage = ko.computed(function () {
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
                });

            const filteredItems = (() => {
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
            })();

            if (
                self.templateData.sortField() &&
                self.templateData.sortDirection()
            ) {
                return sortSpools(
                    filteredItems,
                    self.templateData.sortField(),
                    self.templateData.sortDirection()
                );
            }

            return filteredItems;
        }, self.templateData)
        /** -- end of bindings -- */

        self.templateData.computedTableItemsOnCurrentPage.subscribe(() => {
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
