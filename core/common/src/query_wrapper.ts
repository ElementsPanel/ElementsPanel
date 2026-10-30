interface IMap {
  size: number;
  forEach: (value: any, key?: any) => void;
}

interface Page<T> {
  page: number;
  pageSize: number;
  maxPage: number;
  total: number;
  data: T[];
}

function paginate<T>(data: T[], page: number, pageSize: number): Page<T> {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError("page and pageSize must be positive integers");
  }
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    maxPage: Math.ceil(data.length / pageSize),
    total: data.length,
    data: data.slice(start, start + pageSize)
  };
}

// Provide the MAP query interface used by the routing layer
export class QueryMapWrapper {
  constructor(public map: IMap) {}

  select<T>(condition: (v: T) => boolean): T[] {
    const result: T[] = [];
    this.map.forEach((v: T) => {
      if (condition(v)) result.push(v);
    });
    return result;
  }

  page<T>(data: T[], page = 1, pageSize = 10) {
    return paginate(data, page, pageSize);
  }
}

// Data source interface for QueryWrapper to use
export interface IDataSource<T> {
  selectPage: (condition: any, page: number, pageSize: number) => Page<T>;
  select: (condition: any) => any[];
  update: (condition: any, data: any) => void;
  delete: (condition: any) => void;
  insert: (data: any) => void;
}

// MYSQL data source
export class MySqlSource<T> implements IDataSource<T> {
  constructor(public data: any) {}
  selectPage(condition: any, page: number, pageSize: number) {
    return {
      page,
      pageSize,
      maxPage: 0,
      total: 0,
      data: []
    };
  }
  select(condition: any) {
    return [];
  }
  update(condition: any, data: any) {}
  delete(condition: any) {}
  insert(data: any) {}
}

// local file data source (embedded microdatabase)
export class LocalFileSource<T> implements IDataSource<T> {
  constructor(public data: any) {}

  selectPage(condition: any, page = 1, pageSize = 10) {
    return this.page(this.select(condition), page, pageSize);
  }

  page(data: T[], page = 1, pageSize = 10) {
    return paginate(data, page, pageSize);
  }

  select(condition: Record<string, unknown> = {}): T[] {
    const result: T[] = [];
    const entries = Object.entries(condition);
    this.data.forEach((v: any) => {
      for (const [key, targetValue] of entries) {
        const dataValue = v[key];
        if (
          typeof targetValue === "string" &&
          targetValue.startsWith("%") &&
          targetValue.endsWith("%")
        ) {
          if (typeof dataValue !== "string" || !dataValue.includes(targetValue.slice(1, -1)))
            return;
        } else if (targetValue !== dataValue) {
          return;
        }
      }
      result.push(v);
    });
    return result;
  }
  update(condition: any, data: any) {}
  delete(condition: any) {}
  insert(data: any) {}
}

// Provide the unified data query interface used by the routing layer
export class QueryWrapper<T> {
  constructor(public dataSource: IDataSource<T>) {}

  selectPage(condition: any, page = 1, pageSize = 10) {
    return this.dataSource.selectPage(condition, page, pageSize);
  }
}
