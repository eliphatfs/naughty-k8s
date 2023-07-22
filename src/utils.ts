import { exec } from 'child_process';

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
