import { exec } from 'child_process';

export function delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(() => resolve(), ms));
}

export function throttled(action: () => void, minDelay: number) {
    let flag = false;
    return () => {
        flag = true;
        setTimeout(() => {
            if (flag) action();
            flag = false;
        }, minDelay);
    }
}

export function callAsync(cmd: string) {
    return new Promise<{code: number, stdout: string, stderr: string}>(resolve => {
        exec(cmd, (error, stdout, stderr) => {
            if (error)
            {
                if (error.code)
                    resolve({ code: error.code, stdout, stderr });
                else
                    resolve({ code: NaN, stdout, stderr });
            }
            else
                resolve({code: 0, stdout, stderr});
        })
    })
}

export function systemAsync(cmd: string) {
    return new Promise<number>(resolve => {
        exec(cmd, (error) => {
            if (error)
            {
                if (error.code)
                    resolve(error.code);
                else
                    resolve(NaN);
            }
            else
                resolve(0);
        })
    });
}
