import { addGlobal } from './global.js';

type FormatterCallback = (v?: any[]) => any[];

export type LogLevel = 'VERBOSE' | 'DEBUG' | 'LOG' | 'WARN' | 'ERROR';

let DefaultLogLevel: LogLevel = 'WARN';

export const initLogger = () => {
  DefaultLogLevel = loadStoredLogLevel() || DefaultLogLevel;
};

const loadStoredLogLevel = () => {
  if (typeof window !== 'undefined') {
    const prevlogLevel = window.localStorage.getItem('sermas.logLevel');
    return prevlogLevel as LogLevel;
  }
  return undefined;
};

export const setDefaultLogLevel = (level: LogLevel) => {
  DefaultLogLevel = level;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('sermas.logLevel', level);
  }
};

const levels: Record<LogLevel, number> = {
  VERBOSE: 50,
  DEBUG: 100,
  LOG: 200,
  WARN: 300,
  ERROR: 400,
};

let logFilter: string | undefined = '*';

// set log filter
// empty / undefined = none
// * = all
// prefix = filter by logger prefix
export const setLogFilter = (filter?: string) => {
  logFilter = filter;
};

export class Logger {
  constructor(
    private readonly prefix: string = '',
    private readonly showDates?: boolean,
    private readonly formatterCallback?: FormatterCallback,
    private logLevel?: LogLevel | undefined,
  ) {}

  private format(level: LogLevel, v?: any[]): any[] {
    v = v || [];
    if (this.formatterCallback) {
      return this.formatterCallback(v);
    }
    return [
      `${level} ${this.showDates ? new Date() + ' ' : ''}[${this.prefix}]`,
      ...v,
    ];
  }

  isLogFiltered(level: number) {
    // called here to get window availble (not SSR)
    if (!DefaultLogLevel) {
      DefaultLogLevel = loadStoredLogLevel() || 'WARN';
    }

    const logLevel = this.logLevel || DefaultLogLevel;

    // console.error(
    //   'LOGLEVEL=' + logLevel,
    //   ' --->',
    //   levels[logLevel],
    //   level,
    //   levels[logLevel] > level,
    // );

    if (levels[logLevel] > level) return true;
    if (logFilter === undefined) return true;
    if (logFilter === '*') return false;
    return this.prefix.toLowerCase().indexOf(logFilter.toLowerCase()) === -1;
  }

  clear() {
    console.clear();
  }

  debug(...v: any[]) {
    if (this.isLogFiltered(levels.DEBUG)) return;
    console.debug(...this.format('DEBUG', v));
  }
  log(...v: any[]) {
    if (this.isLogFiltered(levels.LOG)) return;
    console.log(...this.format('LOG', v));
  }
  warn(...v: any[]) {
    if (this.isLogFiltered(levels.WARN)) return;
    console.warn(...this.format('WARN', v));
  }
  error(...v: any[]) {
    if (this.isLogFiltered(levels.ERROR)) return;
    console.error(...this.format('ERROR', v));
  }
}

export const logger = new Logger('default');

addGlobal('setLogFilter', setLogFilter);
initLogger();
