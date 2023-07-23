import os
import json


dispatcher = {}


def command(func):
    dispatcher[func.__name__] = lambda cmd, **kwargs: func(**kwargs)
    return dispatcher[func.__name__]


@command
def ls(p):
    return dict(files=os.listdir(p))

@command
def cd(p):
    os.chdir(p)
    return dict()


def main(dispatcher=dispatcher):
    while True:
        try:
            line = input()
            line = json.loads(line)
            r = dispatcher[line['cmd']](**line)
            r['result'] = 'I'
            print(json.dumps(r))
        except Exception as exc:
            print(json.dumps({"result": "E", "msg": str(exc)}))


if __name__ == '__main__':
    main()
