import os

if __name__ == '__main__':
    port = str(int(os.environ.get('PORT', '3000')))
    os.execvp('gunicorn', ['gunicorn', '--bind', '0.0.0.0:' + port, '--workers', '1', '--threads', '4', '--timeout', '100', 'backend.app:app'])
