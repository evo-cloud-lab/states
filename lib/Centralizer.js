/** @fileoverview
 * Provide Centralizer
 */

var Class  = require('js-class'),
    Logger = require('evo-elements').Logger;

var Centralizer = Class({
    /** @constructor
     * @param {IStatesHost} host
     */
    constructor: function (host, logger, options) {
        this._host = host;
        this._logger = Logger.clone(logger, { prefix: '<cntr> ' });
        this._sendInterval = options['centralize-interval'] || 3000;
    },

    start: function () {
        if (!this._nodes) {
            this._nodes = {};
            this._host.nodeIds.forEach(function (id) {
                this._nodes[id] = true;
            }, this);
            this._revision = this._host.revision;
            this._host.centralize();
            this._sendTimer = setInterval(function () {
                this._host.centralize(this._revision);
            }.bind(this), this._sendInterval);
        }
    },

    stop: function () {
        if (this._sendTimer) {
            clearInterval(this._sendTimer);
            delete this._sendTimer;
        }
        delete this._nodes;
    },

    acknowledge: function (nodeId, data) {
        if (this._nodes && data.r == this._revision) {
            delete this._nodes[nodeId];
            if (Object.keys(this._nodes).length == 0) {
                this.stop();
                return true;
            }
        }
        return false;
    }
});

module.exports = Centralizer;
