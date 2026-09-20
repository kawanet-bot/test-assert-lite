import type {TAL} from "test-assert-lite"

interface BufWriter extends TAL.Writer {
    read: () => string
}

interface ConnectWriter extends TAL.Writer {
    connect: (writer: TAL.Writer) => void
    disconnect: () => void
}

export const createBufWriter = (): BufWriter => {
    const buf: string[] = []

    return {
        write: (chunk) => void buf.push(chunk),
        read: () => buf.splice(0).join(""),
    }
}

export const createConnectWriter = (): ConnectWriter => {
    const buf = createBufWriter()
    let connected: TAL.Writer | undefined = undefined

    return {
        write: (chunk) => (connected ?? buf).write(chunk),
        connect: (writer) => {
            const text = buf.read()
            connected = writer
            if (text) writer.write(text)
        },
        disconnect: () => (connected = undefined),
    }
}

export const pureWriter = (writer: TAL.Writer): TAL.Writer => {
    return {
        write: writer.write.bind(writer),
    }
}
