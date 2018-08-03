import fs from 'fs';
import path from 'path';

import requireResolve from 'require-resolve';

export default class BabelGraphqlManifest {
    static extensions = ['.manifest.json'];

    static isValidExtensions(modPath, customedExtensions) {
        const extensions = (typeof customedExtensions === 'string') ? [customedExtensions] :
            (Array.isArray(customedExtensions) ? customedExtensions : BabelGraphqlManifest.extensions);

        return extensions.some(extension => modPath.endsWith(extension));
    }

    static getManifest(modPath, reference) {
        if (!reference) {
            throw new Error('"reference" argument must be specified');
        }

        const mod = requireResolve(modPath, path.resolve(reference));

        if (!mod || !mod.src) {
            throw new Error(`Path '${modPath}' could not be found for '${reference}'`);
        }

        return fs.readFileSync(mod.src).toString();
    }
}
