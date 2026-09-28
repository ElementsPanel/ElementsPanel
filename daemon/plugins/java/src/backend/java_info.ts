export class JavaInfo implements IJavaInfo {
  public fullname: string;
  public path?: string;
  public downloading: boolean = false;
  public progress?: number;
  public error?: string;

  constructor(
    public name: string,
    public installTime: number,
    public version?: string
  ) {
    this.fullname = version ? `${name}_${version}` : name;
  }
}

export type JavaRuntime = IJavaRuntime;
