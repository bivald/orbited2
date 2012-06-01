=============
Configuration
=============

Orbited2 takes a single command line argument, -c (or --config) and the file location of your config file. The default is orbited2.cfg. This config file has two directives.

Overview
========

A user would run:
    
.. code-block:: none

    user@host:~# orbited2 --config /etc/orbited2.cfg

A configuration example:
    
..  code-block:: python

    # Contents of /etc/orbited2.cfg
    
    # Access Control

    RemoteDestination(
        name="ws_echo", # for logging purposes
        hostname="127.0.0.1", 
        port=8083, 
        host_header = '*', # let any scripts from anywhere access this remote destination
        protocol="ws/hixie76" # normalize outgoing connections to WebSocket draft 76
    )

    # Listen
    
    Listen (
        port=8000,
        interface="0.0.0.0" # bind to all ports
    )

    # Listen, with SSL
    Listen (
        port=8000,
        protocols=['ws', 'csp'],
        interface="0.0.0.0",
        ssl=1,
        certfile='/etc/server.crt',
        keyfile='/etc/server.key'
    )

RemoteDestination
=================

The RemoteDestination directive specifies a remote server that Orbited2 will proxy to. If a webpage tries to use Orbited2 to open a connection to a remote destination that has no corresponding RemoteDestination directive, the connection will be denied. You may have as many remote destinations as you like, so long as they are each given a unique name.

name (required)
---------------

Unique name for logging purposes

hostname (required)
-------------------

Destination hostname. This is a string that may represent either an ip address or a hostname.

port (required)
---------------

Destination port; an integer.

host_header (required)
----------------------

All connections to this remote destination via orbited will only be authorized if the "Host" header in the initial HTTP request matches the value of this rule. This value should just be the domain name of your website, in most cases. For testing purposes you may put a '*' here.

protocol
--------

The outgoing protocol. The default is "ws/hixie76". Valid options are: "tcp", "ws/hixie75", and "ws/hixie76". We will support new versions of the WebSocket protocol as they are released. 

If you are using the Orbited.TCPSocket javascript api, then the value of protocol must be 'tcp'.

If you are using the Orbited.WebSocket.install javascript api, the `protocolVersion` value given there should match the revision number given here.


Listen
======

The Listen directive specifies an interface and port where Orbited2 should listen, as well as a set of protocols it should listen for. You may have as many Listen directives as you like. An example

.. sourcecode:: python

    Listen (
        port=8000,
        interface="0.0.0.0",
		protocols=['ws','csp']
    )


interface (required)
--------------------

A string representing the interface that orbited2 should bind to.


port (required)
---------------

An integer specifying the port that orbited2 should bind to.

protocols (optional)
--------------------

A list of protocols to support for this Listen directive. Valid protocols are ws, csp and monitor. These will be mapped to /ws, /csp and /monitor respectively and decides which transportation methods the browsers can use for this directive. 

ssl (optional)
---------------

An integer specifying if you want to use SSL or not. 


certfile (optional, required for SSL)
---------------

A string representing the full path to your .crt file


keyfile (optional, required for SSL)
---------------

A string representing the full path to your .key file

Configuring SSL
======

SSL requires an SSL certificate. Those of you who've installed certificates for web servers will recognize it. There are a few different kinds of SSL certificates, mainly self-signed or bought via an SSL service. Self-signed is usually used for development and requires you to add an exception in your browsers. SSL for orbited is currently in beta.

Instructions, curtsey of Philip Bennefall
----------------

When buying your certificate, you should generally be asked what type of web server it will be used on. Select Apache, so that you get an Apache "bundle" file (mysite_com.ca-bundle). This is used to verify the CA (certificate authority), which your own .crt file does not do in all browsers on its own. Orbited2 requires you to supply one single .crt file, and does not have direct support for setting up an intermediate chain. However this can be worked around by taking the contents of your Apache bundle file and simply pasting it at the end of the .crt file that you also received in your order. Combine these into one file, and save it as something.crt. Then put this file up in the location that you specified in your Orbited2 configuration file, along with your .key file. Make sure that nobody gets a hold of the .key file, or your certificate will need to be revoked.

Note: The instructions above have been tested with PositiveSsl certificates from Comodo. However the same technique should work across CA's,, provided that you have an Apache bundle file along with your crt and key.

Even if you do not have access to an Apache bundle, most CA's will provide you with root/intermediate crt files that are meant to be installed as a certification chain on a web server. Simply follow the same procedure as listed above if you have downloaded such a file, and it should work equally well. Note that this is yet untested. Apache bundles are known to work.
