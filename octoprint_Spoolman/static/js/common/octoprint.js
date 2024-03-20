async function reloadSettingsViewModel(viewModel) {
    const settingsSavePromise = new Promise((resolve) => {
        // TODO: Investigate if `saveData` can replace custom API endpoint
        // Force save empty data to trigger `settingsViewModel` reload
        viewModel.saveData({}, resolve);
    });

    return settingsSavePromise;
};
