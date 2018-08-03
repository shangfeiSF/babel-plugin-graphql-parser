import colors from 'colors';
import * as babel from 'babel-core';

import Plugin from '../build/index';

const code_1 = `
import './_.manifest.json';
import './_.public.manifest.json';

import {Character, AnotherType} from './Character.graphql';

AnotherType.addResolver({
    a: (root, args, context, info) => Math.random(0, root)
});

Character.addResolver({
    __resolveType: (character, context, info) => info.schema.getType(character.type)
});

export default Character;
`;

const code_2 = `
import {Episode} from './Episode.graphql';

Episode.addResolver({
    NEWHOPE: 4,
    EMPIRE: 5,
    JEDI: 6
});

export default Episode;
`;

const index = 1;
const codes = [code_1, code_2];

const transformedCode = babel.transform(codes[index], {
    filename: __filename,
    plugins: [Plugin]
});

console.log('-----------------------------------------Codes before compiling-----------------------------------------'.red);
console.log(codes[index].yellow);
console.log('-----------------------------------------Codes after compiling------------------------------------------\n'.red);
console.log(transformedCode.code.green);
console.log('\n------------------------------------------------------------------------------------------'.red);
