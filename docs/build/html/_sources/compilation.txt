===========
Compilation
===========

Orbited2
========

TODO: How to install Orbited2 from source

Orbited2.js
===========

Curious users may wish to modify the source code and recompile Orbited2. Here's how, courtesy of Niklas.

1. Check-out js.io from github (https://github.com/gameclosure/js.io)
2. Make a symlink from js.io/jsio to /usr/bin/jsio (for easier use)
3. Enter daemon/orbited/js_src and make sure your orbited.pkg looks something like this:

.. code-block:: none

    {
       "root": "./Orbited2",
       "externalName": "Orbited2",
       "transports": ["csp", "websocket"],
       "environments": ["browser"],
       "additional_dependancies": [ ]
    }

4. Compile the source (while in js_src) with:

.. code-block:: console

    jsio compile Orbited2.pkg -o Orbited2-new.js

or simply:

.. code-block:: console

    make

.. code-block:: console

    make release




5. You're done. Celebrate!

Documentation
=============

Orbited2s documentation is built using Sphinx (http://sphinx.pocoo.org/). If you have easy_install, install it:

.. code-block:: none

   easy_install -U Sphinx

If you don't have easy_install, install from http://pypi.python.org/pypi/Sphinx

We also require Mako template engine (http://www.makotemplates.org/), install it with:

.. code-block:: none

   pip install -U mako

If you don't have pip, install from http://www.makotemplates.org/download.html

Orbite2s documentation consists of a series of .rst (reStructuredText) files, you can read more about it's syntax on http://sphinx.pocoo.org/rest.html

It's fairly straight forward and you can use the other parts of documentation as a starting point.

When you'r done, compile the new files:

 .. code-block:: none

   cd docs
   make html

Which should end with:

.. code-block:: none

    build succeeded, 1 warning.
    
    Build finished. The HTML pages are in build/html.

And then the freshly baked documentation is available in build/html