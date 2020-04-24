class Model extends Croquet.Model {
    init() {
        super.init();

        this.scroll = {
            left : 0,
            top : 0,
        };

        this.subscribe('scroll', 'set', this.setScroll);

        this.subscribe('href', 'set', this.setHref);
    }

    setScroll({scrollX, scrollY, viewId}) {
        this.scroll.left = scrollX;
        this.scroll.top = scrollY;
        this.publish('scroll', 'update', viewId);
    }

    setHref({href, viewId}) {
        this.href = href;
        this.scroll.left = this.scroll.top = 0;
        this.publish('href', 'update', viewId);
    }
}
Model.register();

class ThrottleView extends Croquet.View {
    constructor(model) {
        super(model);

        this._lastTimeThrottledEventsWerePublished = {};
        this._throttledEventTimeoutHandlers = {};

        this.subscribe("throttle", "publish", this._publish);
    }

    _getThrottleKey(scope, event) {
        return `${scope}-${event}`;
    };
    _clearThrottleTimeout(scope, event) {
        clearTimeout(this._throttledEventTimeoutHandlers[this._getThrottleKey(...arguments)]);
    };

    _setThrottleTimeout(scope, event, data, delay) {
        this._clearThrottleTimeout(...arguments);
        this._throttledEventTimeoutHandlers[this._getThrottleKey(...arguments)] = setTimeout(() => {
            super.publish(...arguments);
            this._lastTimeThrottledEventsWerePublished[this._getThrottleKey(...arguments)] = Date.now();
        }, delay);
    };

    publish(scope, event, data, delayMinimum = 0) {
        const lastTimeEventWasPublished = this._lastTimeThrottledEventsWerePublished[this._getThrottleKey(...arguments)] || 0;
        const now = Date.now();
        const timeSinceLastPublish = now - lastTimeEventWasPublished;
        if(timeSinceLastPublish >= delayMinimum) {
            super.publish(...arguments);
            this._lastTimeThrottledEventsWerePublished[this._getThrottleKey(...arguments)] = now;
        }
        else {
            const remainingDelay = delayMinimum - timeSinceLastPublish;
            this._setThrottleTimeout(scope, event, data, remainingDelay);
        }
    }
    _publish({scope, event, data, delayMinimum}) {
        this.publish(scope, event, data, delayMinimum);
    }

    _clear() {
        for(const timeoutHandler in this._throttledEventTimeoutHandlers)
            clearTimeout(timeoutHandler);
    }

    detach() {
        this._clear();
        super.detach();
    }
}

class EventListenerView extends Croquet.View {
    constructor(model) {
        super(model);

        this.eventListeners = [];

        this.subscribe("eventListener", "add", this._addEventListener);
        this.subscribe("eventListener", "remove", this._removeEventListeners);
    }

    addEventListener(element, type, listener, options, thisArg = this) {
        listener = listener.bind(thisArg);
        this.eventListeners.push({element, type, listener});

        element.addEventListener(type, listener, options);
    }
    _addEventListener({element, type, listener, options, thisArg}) {
        this.addEventListener(element, type, listener, options, thisArg);
    }

    removeEventListeners() {
        this.eventListeners.forEach(function({element, type, listener}) {
            element.removeEventListener(type, listener);
        });
    }
    _removeEventListeners() {
        this.removeEventListeners();
    }

    detach() {
        this.removeEventListeners();
        super.detach();
    }
}

class UIView extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;

        this.subscribe('scroll', 'update', this.onUpdateScroll);
        this.publish('eventListener', 'add', {
            element : window,
            type : 'scroll',
            listener : this.onScroll,
            thisArg : this,
        });

        this.subscribe('href', 'update', this.onHrefUpdate);
        document.querySelectorAll(`[data-croquet-href]`).forEach(a => {
            const href = a.dataset.croquetHref;
            const _a = document.createElement('a');
            _a.href = href;
            
            a.addEventListener('click', event => {
                const {href} = _a;
                const {viewId} = this;
                this.publish('href', 'set', {viewId, href});
                _a.click();
            });
        });

        this.reset();
    }

    onScroll(event) {
        if(!this._ignoreScroll) {
            const {scrollX, scrollY} = window;
            const {viewId} = this;

            this.publish('throttle', 'publish', {
                scope : 'scroll',
                event : 'set',
                data : {viewId, scrollX, scrollY},
                delayMinimum : 50,
            });
        }
        this._ignoreScroll = false;
    }

    onUpdateScroll(viewId) {
        if(this.viewId !== viewId)
            this._updateScroll = true;
    }
    updateScroll() {
        if(this._updateScroll) {
            const {top, left} = this.model.scroll;
            this._ignoreScroll = true;
            window.scrollTo({top, left});
            this._updateScroll = false;
        }
    }

    onHrefUpdate(viewId) {
        if(this.viewId !== viewId)
            this.updateHref();
    }
    updateHref() {
        if(this.model.href && window.location.href !== this.model.href)
            window.location.href = this.model.href;
    }

    update() {
        this.updateScroll();
    }

    reset() {
        this._updateScroll = true;
    }
}

class View extends Croquet.View {
    constructor(model) {
        super(model);

        this.throttle = new ThrottleView(model);
        this.eventListener = new EventListenerView(model);
        this.ui = new UIView(model);
    }

    update() {
        this.ui.update();
    }

    detach() {
        this.throttle.detach();
        this.eventListener.detach();
        this.ui.detach();
        
        super.detach();
    }
}


let sessionName = `croquet-iframe`;
const searchParams = (new URL(document.location)).searchParams;
const name = searchParams.get('name');
if(name) {
    sessionName += `-${name}`;
    Croquet.startSession(sessionName, Model, View)
        .then(session => {
            const {view} = session;
            window.view = view;
        });
}