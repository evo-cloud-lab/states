var assert = require('assert'),
    tubes = require('evo-tubes');

describe('evo-states', function () {
    var sandbox;

    beforeEach(function (done) {
        (sandbox = new tubes.Sandbox())
            .add(new tubes.Environment({ nodes: 4 }))
            .add(new tubes.NeuronFactory())
            .add(new tubes.Connector())
            .add(new tubes.States())
            .start(done);
    });

    afterEach(function (done) {
        sandbox.cleanup(done);
    });

    var TIMEOUT = 60000;

});
