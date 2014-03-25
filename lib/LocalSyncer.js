var Class = require('js-class'),
    DelayedJob = require('evo-elements').DelayedJob;

var LocalSyncer = Class({
    constructor: function (host, logger, options) {
        this._host = host;
        this._retryInterval = options['retry-interval'] || 5000;
        this._syncJob = new DelayedJob(this._sync.bind(this), this._retryInterval);
    },

    start: function () {
        if (!this._running) {
            this._syncJob.reschedule(0);
        }
    },

    stop: function () {
        this._syncJob.cancel();
        delete this._running;
    },

    _sync: function () {
        if (!this._running) {
            return;
        }
        this._host.publishLocalStates(function (err) {
            if (!this._running) {
                return;
            }
            if (err) {
                this._syncJob.schedule();
            }
        }.bind(this));
    }
});

module.exports = LocalSyncer;
