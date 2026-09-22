export const tryImport = async <T>(pkg: string): Promise<T | void> => {
    try {
        return await import(pkg)
    } catch (error) {
        if ((error as {code: string})?.code !== "ERR_MODULE_NOT_FOUND") throw error
    }
}
