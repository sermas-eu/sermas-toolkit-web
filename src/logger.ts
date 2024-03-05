type FormatterCallback = (v?: any[]) => any[];

export type LogLevel = 'DEBUG' | 'LOG' | 'WARN' | 'ERROR';

export const DefaultLogLevel: LogLevel = 'DEBUG';

const levels: Record<LogLevel, number> = {
  DEBUG: 100,
  LOG: 200,
  WARN: 300,
  ERROR: 400,
};

export class Logger {
  constructor(
    private readonly prefix: string = '',
    private readonly showDates?: boolean,
    private readonly formatterCallback?: FormatterCallback,
    private readonly logLevel = DefaultLogLevel,
  ) {}

  private format(level: LogLevel, v?: any[]): any[] {
    v = v || [];
    if (this.formatterCallback) {
      return this.formatterCallback(v);
    }
    return [`${this.showDates ? new Date() + ' ' : ''}[${this.prefix}]`, ...v];
  }

  clear() {
    console.clear();
  }

  debug(...v: any[]) {
    if (levels[this.logLevel] !== levels.DEBUG) return;
    console.debug(...this.format('DEBUG', v));
  }
  log(...v: any[]) {
    if (levels[this.logLevel] > levels.DEBUG) return;
    console.log(...this.format('LOG', v));
  }
  warn(...v: any[]) {
    if (levels[this.logLevel] > levels.LOG) return;
    console.warn(...this.format('WARN', v));
  }
  error(...v: any[]) {
    if (levels[this.logLevel] > levels.WARN) return;
    console.error(...this.format('ERROR', v));
  }
}

export const logger = new Logger('default');
