var http = require('http'),
    https = require('https'),
    url = require('url');

exports.request = function(method, url_to_fetch, query, options, payload, dataCallback, endCallback) {
    var requestParam = '?' + Object.keys(query).map(function(key) { return key + '=' + query[key];}).join('&');
    var parsed = url.parse(url_to_fetch);
    var auth = 'Basic ' + new Buffer(parsed.auth).toString('base64');
    var headers = options.headers || {};
    var payloadString = JSON.stringify(payload);

    headers.Authorization = headers.Authorization || auth;
    headers['Content-length'] = ['POST', 'PUT', 'OPTIONS'].indexOf(method) != -1 ? payloadString : 0;

    var protocol = parsed.protocol == 'http:' ? http : https;

    //We allow for payload to be skipped
    if (!endCallback && typeof payload == 'function') {
      endCallback = dataCallback;
      dataCallback = payload;
    }

    var request = protocol.request({
      hostname:parsed.hostname,
      path:parsed.path,
      port:parsed.port,
      method: method,
      keepAlive:options.keepAlive,
      headers:headers
    });

    function parseData(response, data) {
        var ct = (response.headers['content-type'] || '').split(';')[0];
        if (ct === 'application/json') {
            // trim whitespace
            data = data.replace(/^\s+|\s+$/g, '');
            // parse if any data, otherwise return null
            return data.length ? JSON.parse(data): null;
        }
        return data;
    }

    request.on('response', function(response) {
        var buffer = [];
        response.on('data', function (chunk) {
            if (dataCallback) {
                // don't accumulate final result, call function
                // immediately with data
                var data = parseData(response, chunk.toString());
                if (data) {
                    // don't return 'null's on newlines
                    return dataCallback(null, data);
                }
            }
            else {
                // accumulate final result
                buffer.push(chunk.toString());
            }
        });
        response.on('end', function () {
            try {
                var data = parseData(response, buffer.join(''));
            }
            catch (e) {
                return endCallback(e);
            }
            if (response.statusCode >= 300) {
                if (data && data.error) {
                    var err = new Error(
                        data.error + (data.reason ? '\n' + data.reason: '')
                    );
                    return endCallback(err);
                }
                else {
                    return endCallback(response);
                }
            }
            else {
                process.nextTick(function () {
                    return endCallback();
                });
            }
        });
    });

    if (payloadString) {
      request.write(payloadString);
    }

    request.end();
}
