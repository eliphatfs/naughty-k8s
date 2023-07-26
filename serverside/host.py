import os
import stat
import json
import shutil
import base64
import threading


dispatcher = {}
workspace_size_limit = 5 * 1024 * 1024
stdout_lock = threading.Lock()


def command(func):
    dispatcher[func.__name__] = func
    return func


@command
def ls(p):
    return dict(files=[
        dict(n=f.name, k=f.is_file() * 1 + f.is_dir() * 2 + f.is_symlink() * 64)
        for f in os.scandir(p)
    ])

@command
def mstat(p):
    s = os.stat(p)
    m = s.st_mode
    prefetch_ls = None
    if stat.S_ISDIR(m):
        # prefetch
        the_dir = ls(p)['files']
        if sum(len(f['n']) for f in the_dir) + len(the_dir) * 8 < 4096:
            prefetch_ls = the_dir
    return dict(
        type=stat.S_ISREG(m) * 1 + stat.S_ISDIR(m) * 2 + stat.S_ISLNK(m) * 64,
        ctime=s.st_ctime_ns // 1e6,
        mtime=s.st_mtime_ns // 1e6,
        size=s.st_size,
        prefetch_ls=prefetch_ls,
        permissions=0 if os.access(p, os.W_OK) and s.st_size <= workspace_size_limit else 1
    )

@command
def b64read(p):
    if os.path.getsize(p) > workspace_size_limit:
        return dict(b64=base64.standard_b64encode(
            f'We do not support files larger than 5MB ({round(os.path.getsize(p) / 1048576)} MB) in workspace yet since this would freeze the daemon'
            .encode()
        ).decode('ascii'))
    with open(p, 'rb') as f:
        return dict(b64=base64.standard_b64encode(f.read()).decode('ascii'))

@command
def b64write(p, contents):
    # type: (str, str) -> dict
    with open(p, 'wb') as f:
        return dict(nb=f.write(base64.standard_b64decode(contents.encode('ascii'))))

@command
def mkdirs(p):
    os.makedirs(p, exist_ok=True)
    return dict()

@command
def rm(p, recursive=False):
    if os.path.isdir(p):
        if recursive:
            shutil.rmtree(p)
        else:
            os.rmdir(p)
    else:
        os.remove(p)
    return dict()

@command
def mv(src, dst):
    shutil.move(src, dst)
    return dict()

@command
def cp(src, dst):
    if os.path.isdir(src):
        shutil.copytree(src, dst, dirs_exist_ok=True, symlinks=True)
    else:
        shutil.copy(src, dst)
    return dict()

@command
def cd(p):
    os.chdir(p)
    return dict()

@command
def test():
    return dict(msg="hello from pod")


def dispatch(ticket, line):
    # type: (int, dict) -> None
    try:
        cmd = line.pop('cmd')
        r = dispatcher[cmd](**line)  # type: dict
        r.update(result='I', ticket=ticket)
        with stdout_lock:
            print(json.dumps(r), flush=True)
    except Exception as exc:
        with stdout_lock:
            print(json.dumps({"result": "E", "ticket": ticket, "msg": str(exc)}), flush=True)


def main():
    while True:
        try:
            line = json.loads(input())  # type: dict
            ticket = line.pop('ticket')
            threading.Thread(
                target=dispatch, args=(ticket, line),
                daemon=True, name="dispatch-%d" % ticket
            ).start()
        except EOFError:
            return
        except Exception as exc:
            with stdout_lock:
                print(json.dumps({"result": "E", "msg": str(exc)}), flush=True)


if __name__ == '__main__':
    main()
