/**
 * @template PayloadType
 * @typedef {{
 *  isSuccess: true,
 *  payload: PayloadType,
 * }} Success
 */
/**
 * @template ErrorType
 * @typedef {{
 *  isSuccess: false,
 *  error: ErrorType,
 * }} Failure
 */

/**
 * @template PayloadType
 * @param {PayloadType} payload
 * @returns {Success<PayloadType>}
 */
const createSuccess = (payload) => {
    return {
        isSuccess: true,
        payload,
    };
};
/**
 * @template ErrorType
 * @param {ErrorType} error
 * @returns {Failure<ErrorType>}
 */
const createFailure = (error) => {
    return {
        isSuccess: false,
        error,
    };
};

const ASYNC_FN_FAIL_ERROR = "ASYNC_FN_FAILED";
const REQUEST_FAILED_ERROR = "REQUEST_FAILED";

/**
 * @template {unknown[]} AsyncArgs
 * @template AsyncResult
 * @param {(...args: AsyncArgs) => Promise<AsyncResult>} asyncFn
 */
const safeAsync = (asyncFn) => {
    /**
     * @param {AsyncArgs} args
     */
    const callAsync = async (...args) => {
        try {
            return await asyncFn(...args);
        } catch (error) {
            return createFailure({
                /**
                 * @type {typeof ASYNC_FN_FAIL_ERROR}
                 */
                type: ASYNC_FN_FAIL_ERROR,
                errorObj: error,
            });
        }
    };

    return callAsync;
};

const methodsWithBody = [
    "POST",
    "PUT",
    "PATCH",
];

/**
 * @param {string} pluginId
 * @param {string} baseUrl
 */
function APIClient(pluginId, baseUrl) {
    /**
     * @param {string | Record<string, string>} data
     */
    const _buildRequestQuery = function (data) {
        if (typeof (data) === 'string') {
            return data;
        }

        return Object
            .entries(data)
            .map(([ key, value ]) => {
                const encodedKey = encodeURIComponent(key);
                const encodedValue = encodeURIComponent(value);

                return `${encodedKey}=${encodedValue}`;
            })
            .join('&');
    };

    /**
     * @param {string} url
     */
    const buildApiUrl = (url) => {
        return `${baseUrl}plugin/${pluginId}/${url}`;
    };

    /**
     * @param {{
     *  method?: string;
     *  headers?: Record<string, string>;
     *  body?: string;
     * }} options
     */
    const buildFetchOptions = (options) => {
        const requestMethod = (options.method ?? "GET").toUpperCase();

        const fetchOptions = {
            ...options,
        };

        if (methodsWithBody.includes(requestMethod)) {
            const stockClient = new OctoPrintClient({
                baseurl: "/",
            });

            fetchOptions.headers = {
                'Content-Type': "application/json; charset=UTF-8",
                'X-CSRF-Token': stockClient.getCookie("csrf_token"),
                ...(fetchOptions.headers ?? {}),
            };
        }

        return fetchOptions;
    };

    /**
     * @param {string} url
     * @param {Parameters<typeof buildFetchOptions>[0]} options
     */
    const callApi = async (url, options) => {
        const endpointUrl = buildApiUrl(url);
        const fetchOptions = buildFetchOptions(options);

        const request = await fetch(endpointUrl, fetchOptions);
        const response = await ((async () => {
            if (request.headers.get('Content-Type') !== 'application/json') {
                return;
            }

            try {
                /**
                 * @type unknown
                 */
                const responseJSON = await request.json();

                return responseJSON;
            } catch (error) {
                return;
            }
        }))();

        if (!request.ok) {
            return createFailure({
                /**
                 * @type {typeof REQUEST_FAILED_ERROR}
                 */
                type: REQUEST_FAILED_ERROR,
                /**
                 * @type true
                 */
                isRequestFailure: true,
                response,
            });
        }

        return createSuccess({
            response,
        });
    };

    // Expose public interface
    this.callApi = callApi;
};
