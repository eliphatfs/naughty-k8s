import os
import stat
import json
import base64


dispatcher = {}


def command(func):
    dispatcher[func.__name__] = func
    return func


@command
def ls(p):
    return dict(files=[
        dict(name=f.name, kind=f.is_file() * 1 + f.is_dir() * 2 + f.is_symlink() * 64)
        for f in os.scandir(p)
    ])

@command
def mstat(p):
    s = os.lstat(p)
    m = s.st_mode
    return dict(
        type=stat.S_ISREG(m) * 1 + stat.S_ISDIR(m) * 2 + stat.S_ISLNK(m) * 64,
        ctime=s.st_ctime_ns / 1e6,
        mtime=s.st_mtime_ns / 1e6,
        size=s.st_size
    )

@command
def b64read(p):
    if os.path.getsize(p) > 5 * 1024 * 1024:
        return dict(b64=base64.standard_b64encode(
            b'We do not support files larger than 5MB in workspace yet since this would freeze the daemon'
        ).decode('ascii'))
    with open(p, 'rb') as f:
        return dict(b64=base64.standard_b64encode(f.read()).decode('ascii'))

@command
def cd(p):
    os.chdir(p)
    return dict()

@command
def test():
    return dict(msg="hello from pod")

def main(dispatcher=dispatcher):
    while True:
        try:
            ticket = None
            line = json.loads(input())  # type: dict
            ticket = line.pop('ticket')
            cmd = line.pop('cmd')
            r = dispatcher[cmd](**line)  # type: dict
            r.update(result='I', ticket=ticket)
            print(json.dumps(r), flush=True)
        except EOFError:
            return
        except Exception as exc:
            print(json.dumps({"result": "E", "ticket": ticket, "msg": str(exc)}), flush=True)


if __name__ == '__main__':
    main()
