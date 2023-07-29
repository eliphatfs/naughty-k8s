declare module 'node-ansiterminal' {
    export class TRow {
        toString(): string
    }
    export class TScreen {
        buffer: TRow[]
        scrollbuffer: TRow[]
    }
    export class AnsiTerminal {
        constructor(cols: number, rows: number, scrollLength: number);
        screen: TScreen
        newline_mode: boolean
    }
}

declare module 'node-ansiparser' {
    export default class AnsiParser {
        constructor(callback: any);
        parse(i: string);
    }
}
