var flow = require('js-flow'),
    assert = require('assert'),
    tubes = require('evo-tubes');

describe('evo-states', function () {
    var TIMEOUT = 60000;

    var sandbox;

    beforeEach(function (done) {
        this.timeout(TIMEOUT);
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

    it('synchronize', function (done) {
        this.timeout(TIMEOUT);
        var connector = sandbox.res('evo-connector');
        flow.steps()
            .next('clientsReady')
            .next(function (next) {
                flow.each([this.clients[0], this.clients[1]])
                    .keys()
                    .do(function (index, client, next) {
                        client.commit({ key: 'val' + index }, next);
                    })
                    .run(next);
            })
            .next(function (next) {
                this.waitForSync({ key: 'key' }, function (data, client, index) {
                    return [0, 1].every(function (i) {
                        var nodeVal = data.d[connector.clients[i].localId];
                        return nodeVal && nodeVal.d == 'val' + i;
                    });
                }, next);
            })
            .with(sandbox.res('evo-states'))
            .run(done)
    });
});
