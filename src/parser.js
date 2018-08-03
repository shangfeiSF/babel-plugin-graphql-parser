import fs from 'fs';
import path from 'path';

import requireResolve from 'require-resolve';

export default class BabelGraphqlParser {
    static extensions = ['.graphql'];

    static isValidExtensions(modPath, customedExtensions) {
        const extensions = (typeof customedExtensions === 'string') ? [customedExtensions] :
            (Array.isArray(customedExtensions) ? customedExtensions : BabelGraphqlParser.extensions);

        return extensions.some(extension => modPath.endsWith(extension));
    }

    static getModcontent(modPath, reference) {
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
