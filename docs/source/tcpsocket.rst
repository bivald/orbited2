=============
TCP Socket
=============

Orbited has two main functions: cross-browser web socket and TCP socket. TCP Socket is a bridge between the browser (javascript) and a TCP service on the other side of Orbited (this can be a STOMP service, IRC service, your own TCP service etc.). 

.. sourcecode:: javascript

    var sock = new Orbited2.TCPSocket({ orbitedUri: "http://127.0.0.1:8000", forceTransport: "csp" })
    sock.open("irc.freenode.org", 6667);
    sock.onopen = function() { 
        sock.send('NICK mcarter\r\n');
    }
    //etc

If we break it down:

.. sourcecode:: javascript

    var sock = new Orbited2.TCPSocket({ orbitedUri: "http://127.0.0.1:8000", forceTransport: "csp" })

This creates a new Orbited2 TCPSocket. Options:


.. sourcecode:: javascript

    { 
      orbitedUri: "http://127.0.0.1:8000",
      forceTransport: "csp",
      browserLogLevel: 4
    }

orbitedUri: URI and port to orbited. This can be either HTTP or (experimental) HTTPs
forceTransport: Should orbited let the browser choose the best transport (using websockets if possible, or old-school "csp"). Currently there are known issues with the ws protocol, thus we recommend using "csp". 
browserLogLevel: What log level to use in the clients browser. The log is printed in real-time to console.log. Orbited2 supports the following browser log levels:

.. sourcecode:: javascript

    var logging = {
		DEBUG: 1,
		LOG: 2,
		INFO: 3,
		WARN: 4,
		ERROR: 5
	},

from https://github.com/gameclosure/js.io/blob/b26156c11d9b97cc911a017033c3758d20cfcc12/packages/base.js#L143

.. sourcecode:: javascript

    sock.open("irc.freenode.org", 6667);

Parameters are:

.. sourcecode:: javascript

    sock.open(server_address, server_port, binary_protocol);

server_address: The address for Orbited to connect to
server_port: The port for Orbited to connect to 
binary_protocol: Is the data binary or text? If you plan to send binary data such as images over Orbited, this should be set to true. If you plan to only send text (as in when connecting to an irc server) binary should be set to false. 

Also, when set to binary Orbited does not handle string encoding at all. It's worth noting here that browsers do not use UTF-8 internally, but UTF-16. If you plan to send binary data, unless you want UTF-16 for any reason, we recommend that you encode text strings from UTF-16 to UTF-8 before sending them using the send method of the socket class. You may read more about this on https://gist.github.com/2780226 (thanks to Philip Bennefall for pointing this out)

.. sourcecode:: javascript

    sock.onopen = function() { 
       // handle server connects here
    }

onopen is called when the server has established the connection to the end remote service. If connecting to an IRC server, this would be the right time to send the initial commands (such as NICK, USER etc.). Remember, if your server is a line-separated protocol such as IRC, you need to send  "\n" at the end. 

.. sourcecode:: javascript

    sock.onclose = function() { 
       // handle server disconnects here, triggered by a variety of reasons (remote server closed the connection, pinged out, etc. )
    }

.. sourcecode:: javascript

    sock.onread = function(data)
    {
       // handle server data here
    }


.. sourcecode:: javascript

    sock.send(data)

Remember, when sock.open is set to binary Orbited does not handle string encoding at all. It's worth noting here that browsers do not use UTF-8 internally, but UTF-16. If you plan to send binary data, unless you want UTF-16 for any reason, we recommend that you encode text strings from UTF-16 to UTF-8 before sending them using the send method of the socket class. You may read more about this on https://gist.github.com/2780226 (thanks to Philip Bennefall for pointing this out)

.. sourcecode:: javascript

    sock.close()

Closes the socket. Will trigger .onclose()