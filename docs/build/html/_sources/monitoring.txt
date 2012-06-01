==========
Monitoring
==========

Orbited2 has a monitoring class, which allows you to "listen in" and make graphs on this such as numbers of connections, CPU usage etc. First you need to configure Orbited2 to create a monitoring service, recommended config:

.. code-block:: console

    Listen (
        port=6000,
        protocols=['monitor'],
        interface="127.0.0.1",
    )

This creates a monitor service only reachable via localhost. More in the configuration part of this documentation. 

To use Orbited2 monitoring, you need to install the psutil class, available from http://code.google.com/p/psutil/ or easily installed with:

.. code-block:: console

   pip install psutil

The statistics is served on /monitor (in our case above: http://localhost:6000/monitor) and will return a JSON object:

.. code-block:: json

    {
	   "memory-usage-percent": 2.7271479340481677,
	   "memory-info":{
	      "vms":103034880,
	      "rss":14647296
	   },
	   "sockets":{
	      "csp-sockets": 400
	   },
	   "cpu-percent":0
	}
	
Note: Each call to /monitor takes roughly 500ms, this is because we sample the CPU usage in that time. 