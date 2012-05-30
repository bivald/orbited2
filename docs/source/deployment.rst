==========
Deployment
==========

Orbited2 takes a single command line argument, -c (or --config) and the file location of your config file. The default is orbited2.cfg. Thus, deployment consists of creating a suitable orbited2.cfg and typing:

.. sourcecode:: console

    orbited2

Orbited2 itself has no daemon mode (i.e you can't add a --daemon line and it will run automatically in the background). 

Screen
======

There are various of ways of running orbited2 in the background. If you want to be able to easily view possible messages and errors use screen. Screen allows you to attach and detach a shell without closing the running applications. You can learn more about screen on http://www.gnu.org/software/screen/ and http://www.kuro5hin.org/story/2004/3/9/16838/14935. It's usually installed via your package repository (such as yum, apt-get, .rpm files etc.). To launch orbited using screen:


.. sourcecode:: console

    screen
    orbited2

Then detach the screen C-a d (ctrl + a + d). The screen can then be found and reattached using:

.. sourcecode:: console

    screen -ls
    There are screens on:
    24673.pts-3.hostname	(05/30/2012 11:25:55 AM)	(Detached)
    
    screen -r 24673.pts-3.hostname

Nohup
======

Nohup is a linux command "enabling the [your] command to keep running after the user who issues the command has logged out" (http://en.wikipedia.org/wiki/Nohup)

.. sourcecode:: console

	nohup orbited2 &> /home/user/path/orbited2.log &
	
The & at the end detaches the script from the current shell. 

Cronjob
=======

Below is a very simply cronjob to make sure Orbited2 is running (and is started if it isn't). 

.. sourcecode:: bash

	#!/bin/bash

	if [ `ps ax|grep orbited2|grep python|wc -l` = 0 ]
	then
		nohup orbited2 &> /home/user/path/orbited2.log &
	fi

It's a very rudimentary script, but does it's job. Remember if you have Orbited2 running on privileged ports (i.e port 80/443) the cronjob need to be run as root. 