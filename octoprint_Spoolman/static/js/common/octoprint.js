async function reloadSettingsViewModel(viewModel) {
    const settingsSavePromise = new Promise((resolve) => {
        // TODO: Investigate if `saveData` can replace custom API endpoint
        // Force save empty data to trigger `settingsViewModel` reload
        viewModel.saveData({}, resolve);
    });

    return settingsSavePromise;
};

/**
 * @typedef {object} ShowPopupParams
 * @property {string} type
 * @property {string} subject
 * @property {string} message
 * @property {boolean} shouldDeduplicate
 * @property {boolean} shouldAutoclose
 * @property {boolean} shouldShowType
 */

/**
 * @param {ShowPopupParams} params
 */
function showSpoolmanPopup(params) {
    const {
        type,
        subject,
        message,
        shouldDeduplicate = false,
        shouldAutoclose,
        shouldShowType = false,
    } = params;

    const title = (() => {
        const baseTitle = `Spoolman: ${subject}`;
        const prefix = (
            shouldShowType
                ? `[${type.toUpperCase()}] `
                : ''
        );

        return `${prefix}${baseTitle}`;
    })();

    const popupIdClass = `${title}-${message}`.replace(/([^a-z0-9]+)/gi, '-');

    const hasSamePopupAlready = document.querySelector(`.${popupIdClass}`) !== null;

    if (shouldDeduplicate && hasSamePopupAlready) {
        return;
    }

    new PNotify({
        title,
        text: message.trim(),
        type,
        hide: shouldAutoclose,
        addclass: popupIdClass
    });
}
