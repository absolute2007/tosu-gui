declare module 'pngjs' {
  export interface PNGOptions {
    width?: number
    height?: number
    fill?: boolean
    deflateChunkSize?: number
    deflateLevel?: number
    deflateStrategy?: number
    filterType?: number | number[]
    colorType?: number
    inputColorType?: number
    bitDepth?: number
    inputHasAlpha?: boolean
    bgColor?: {
      red: number
      green: number
      blue: number
    }
  }

  export class PNG {
    constructor(options?: PNGOptions)
    width: number
    height: number
    data: Buffer
    gamma: number
    pack(): PNG
    parse(data: string | Buffer, callback?: (err: Error, data: PNG) => void): PNG
    write(options?: PNGOptions): Buffer
    static sync: {
      read(buffer: Buffer, options?: PNGOptions): PNG
      write(png: PNG, options?: PNGOptions): Buffer
    }
  }
}
