try:
    import psutil
except:
    raise Exception("You need to install the psutil module to use Orbited2 monitoring, see the documentation for more information.")

import os
try:
    import json
except:
    import simplejson as json

class Monitoring():
    
    def __init__(self,server,config):
        self._server = server
        self._config = config
        self._pid    = os.getpid()
        
        
    def __call__(self, env, start_response):
        start_response('200 OK', [('Content-Type', 'text/plain')])
        
        p           = psutil.Process(self._pid)
        memory_info = p.get_memory_info()
        
        statistics  = { 
            'sockets': {
                'csp-sockets': len(self._server._csp_sock._sessions)
            },
            'cpu-percent': p.get_cpu_percent(interval=0.5),
            'memory-usage-percent': p.get_memory_percent(),
            'memory-info': {
                'rss': memory_info[0],
                'vms': memory_info[1]
            }
        }
        
        del memory_info
        del p
        
        return [ '%s\r\n' % json.dumps(statistics) ]