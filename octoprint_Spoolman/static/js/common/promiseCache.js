/**
 * @typedef {(...args: unknown[]) => Promise<unknown>} GetterFn

* @typedef {GetterFn & { invalidate: () => void }} CachedGetterFn
 */

class PromiseCache {
    constructor() {
        /**
         * @type {Record<string, {
         *  getter: GetterFn,
         *  cachedGetter: CachedGetterFn,
         *  resourceState:
         *      | {
         *          isCached: false,
         *      }
         *      | {
         *          isCached: true,
         *          data: unknown,
         *      },
         * }>}
         */
        this.resourcesByKey = {};

        /**
         * @type {Record<string, Array<() => void>>}
        */
        this.invalidationHandlersByKey = {};
    }

    /**
     * @param {string} resourceKey
     */
    _createCachedGetter(resourceKey) {
        /**
         * @param {...unknown} args
         */
        const getter = async (...args) => {
            const resourceCache = this.resourcesByKey[resourceKey];

            if (!resourceCache.resourceState.isCached) {
                const resourceData = resourceCache.getter(...args);

                resourceCache.resourceState = {
                    isCached: true,
                    data: resourceData,
                };
            }

            return resourceCache.resourceState.data;
        };

        getter.invalidate = () => {
            this.invalidateResource(resourceKey);
        };

        return getter;
    }

    /**
     * @param {string[]} resourceKeys
     */
    _triggerInvalidationHandlersFor(resourceKeys) {
        const handlersToRun = new Set();

        resourceKeys.forEach((resourceKey) => {
            const handlersForKey = this.invalidationHandlersByKey[resourceKey] ?? [];

            handlersForKey.forEach((handler) => {
                handlersToRun.add(handler);
            });
        });

        handlersToRun.forEach((handler) => {
            handler();
        });
    }

    /**
     * @param {string} resourceKey
     * @param {{ getter: GetterFn }} params
     */
    registerResource(resourceKey, params) {
        if (this.resourcesByKey[resourceKey]) {
            return {
                /** @type false */
                isSuccess: false,
                error: {
                    resourceAlreadyExists: true,
                },
            };
        }

        this.resourcesByKey[resourceKey] = {
            getter: params.getter,
            cachedGetter: this._createCachedGetter(resourceKey),
            resourceState: {
                isCached: false,
            },
        };

        return {
            /** @type true */
            isSuccess: true,
            getter: this.resourcesByKey[resourceKey].cachedGetter,
        };
    }

    /**
     * @param {string} resourceKey
     * @param {{ preventHandlersTrigger?: boolean }} options
     */
    invalidateResource(resourceKey, options = {}) {
        const resource = this.resourcesByKey[resourceKey];

        if (!resource) {
            return {
                isSuccess: false,
                error: {
                    invalidResource: true,
                },
            };
        }

        resource.resourceState = {
            isCached: false,
        };

        if (!options.preventHandlersTrigger) {
            this._triggerInvalidationHandlersFor([ resourceKey ]);
        }

        return {
            isSuccess: true,
            payload: undefined,
        };
    }

    /**
     * @param {string[]} resourceKeys
     * @param {{ preventHandlersTrigger?: boolean }} options
     */
    invalidateResources(resourceKeys, options = {}) {
        resourceKeys.forEach((resourceKey) => {
            this.invalidateResource(resourceKey, { preventHandlersTrigger: true });
        });

        if (!options.preventHandlersTrigger) {
            this._triggerInvalidationHandlersFor([ resourceKey ]);
        }
    }

    /**
     * Attaches handler which is triggered on invalidation event.
     * Each handler is guaranteed to run only once, regardless of how many resources
     * get invalidated in one run.
     *
     * Note: does not properly support async handlers, in a sense that
     * each executed handler will be executed synchronously, not awaiting the resulting promise.
     *
     * @param {string[]} resourceKeys
     * @param {() => void} handler
     */
    onResourcesInvalidated(resourceKeys, handler) {
        resourceKeys.forEach((resourceKey) => {
            if (!this.invalidationHandlersByKey[resourceKey]) {
                this.invalidationHandlersByKey[resourceKey] = [];
            }

            this.invalidationHandlersByKey[resourceKey].push(handler);
        });
    }
};
