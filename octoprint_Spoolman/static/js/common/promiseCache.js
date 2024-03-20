class PromiseCache {
    constructor() {
        /**
         * @type {Record<string, {
         *  getter: (...args: unknown[]) => Promise<unknown>,
         *  cachedGetter: ((...args: unknown[]) => Promise<unknown>) & { invalidate: () => void },
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

        this.invalidationHandlersByKey = {};
    }

    _createCachedGetter(resourceKey) {
        const getter = async (...args) => {
            const resourceCache = this.resourcesByKey[resourceKey];

            if (!resourceCache.resourceState.isCached) {
                const resourceData = await resourceCache.getter(...args);

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

    registerResource(resourceKey, params) {
        if (this.resourcesByKey[resourceKey]) {
            return {
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
            isSuccess: true,
            getter: this.resourcesByKey[resourceKey].cachedGetter,
        };
    }

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
