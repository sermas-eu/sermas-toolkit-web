import { addGlobal } from './global.js';

type FormatterCallback = (v?: any[]) => any[];

export type LogLevel = 'VERBOSE' | 'DEBUG' | 'LOG' | 'WARN' | 'ERROR';

let DefaultLogLevel: LogLevel = 'WARN';

export const initLogger = () => {
  DefaultLogLevel = loadStoredLogLevel() || DefaultLogLevel;
  loadLogFilter();
};

const loadLogFilter = () => {
  if (typeof localStorage !== 'undefined') {
    const filterRaw = localStorage.getItem('sermas.logFilter');
    if (!filterRaw) return;
    try {
      const filter = JSON.parse(filterRaw);
      setLogFilter(...filter);
      console.warn(
        `log fitlers set: ${filter}. Use SERMAS.resetLogFilters() to reset`,
      );
    } catch {}
  }
};

const loadStoredLogLevel = () => {
  if (typeof localStorage !== 'undefined') {
    const prevlogLevel = localStorage.getItem('sermas.logLevel');
    return prevlogLevel as LogLevel;
  }
  return undefined;
};

export const setDefaultLogLevel = (level: LogLevel) => {
  DefaultLogLevel = level;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('sermas.logLevel', level);
  }
};

const levels: Record<LogLevel, number> = {
  VERBOSE: 50,
  DEBUG: 100,
  LOG: 200,
  WARN: 300,
  ERROR: 400,
};

type LogFilter = string[];

const defaultLogFilter = ['*'];
let logFilter: LogFilter | undefined = defaultLogFilter;

// set log filter
// empty / undefined = none
// * = all
// prefix = filter by logger prefix
export const setLogFilter = (...args: string[]) => {
  logFilter = [...args];
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      'sermas.logFilter',
      JSON.stringify(logFilter || defaultLogFilter),
    );
  }
};

export const resetLogFilter = () => {
  logFilter = defaultLogFilter;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('sermas.logFilter');
  }
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
      `${level} ${new Date().toLocaleTimeString().split(' ')[0]} ${this.showDates ? new Date() + ' ' : ''}[${this.prefix}]`,
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
    if (logFilter.indexOf('*') > -1) return false;

    const filters = logFilter instanceof Array ? [...logFilter] : [logFilter];

    const filtered = !(
      filters.filter(
        (pattern) =>
          this.prefix.toLowerCase().indexOf(pattern.toLowerCase()) > -1,
      ).length > 0
    );

    // console.warn('filters', filters, 'filtered', filtered);

    return filtered;
  }

  clear() {
    console.clear();
  }

  verbose(...v: any[]) {
    if (this.isLogFiltered(levels.VERBOSE)) return;
    console.debug(...this.format('VERBOSE', v));
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
addGlobal('resetLogFilter', resetLogFilter);

initLogger();
