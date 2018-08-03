import * as nodePath from 'path';

import {uniq} from 'lodash';
import * as babel from 'babel-core';
import {parse, Kind, GraphQLInt, GraphQLFloat, GraphQLString, GraphQLBoolean, GraphQLID} from 'graphql';

import BabelGraphqlParser from './parser';
import BabelGraphqlManifest from './manifest';

const KINDS = [
    Kind.SCHEMA_DEFINITION,
    Kind.SCALAR_TYPE_DEFINITION,
    Kind.OBJECT_TYPE_DEFINITION,
    Kind.INTERFACE_TYPE_DEFINITION,
    Kind.ENUM_TYPE_DEFINITION,
    Kind.UNION_TYPE_DEFINITION,
    Kind.INPUT_OBJECT_TYPE_DEFINITION,
    Kind.DIRECTIVE_DEFINITION
];

const SPECIFIED_SCALAR_TYPES = [
    GraphQLInt.name,
    GraphQLFloat.name,
    GraphQLString.name,
    GraphQLBoolean.name,
    GraphQLID.name
];

const isSpecifiedScalarType = name => SPECIFIED_SCALAR_TYPES.indexOf(name) > -1;
const findName = type => type.kind && type.kind === 'NamedType' ? type.name.value : findName(type.type);
const recurseComments = prev => prev.kind === 'Comment' ? [`#${prev.value}`, ...recurseComments(prev.prev)] : [];
const checkComment = node => {
    if (node.loc.startToken.prev.kind !== 'Comment') {
        throw new Error(`Please declare the description of "${node.loc.source.body.slice(node.loc.start, node.loc.end)}"!`);
    }
};

const gen1 = babel.template(`var NAME = require(PATH);`);
const gen2 = babel.template(`this.resolver[this.name] = resolver;`);

export default class BabelGraphqlTransformer {
    start = types => ({
        visitor: {
            ImportDeclaration: {
                exit: (path, state) => this.transform(types, path, state)
            }
        }
    })

    transform = (types, path, state) => {
        const modPath = path.node.source.value;
        const extensions = state && state.opts && state.opts.extensions;

        BabelGraphqlManifest.isValidExtensions(modPath, extensions) && this.parseManifest(types, path, state);
        BabelGraphqlParser.isValidExtensions(modPath, extensions) && this.parseDefinition(types, path, state);
    }

    parseManifest = (types, path, state) => {
        const modPath = path.node.source.value;
        const reference = state && state.file && state.file.opts.filename;

        const filepath = nodePath.resolve(nodePath.dirname(reference), modPath);

        let manifest = JSON.parse(BabelGraphqlManifest.getManifest(modPath, reference));
        for (let key in manifest) {
            manifest[key] = nodePath.resolve(nodePath.dirname(filepath), manifest[key]);
        }

        this.manifest = {...this.manifest, ...manifest};

        path.remove();
    }

    parseDefinition = (types, path, state) => {
        const modPath = path.node.source.value;
        const reference = state && state.file && state.file.opts.filename;

        const specifiers = path.node.specifiers.map(specifier => specifier.local.name);

        this.definitions.forEach(definition => {
            if (specifiers.indexOf(definition.name) > -1) {
                throw new Error(`There has already been a definition named ${definition.name}.`);
            }
        });

        const content = BabelGraphqlParser.getModcontent(modPath, reference);

        const ast = parse(content);

        if (!ast || ast.kind !== Kind.DOCUMENT) {
            throw new Error('Must provide a document ast.');
        }

        const variableAstNodes = ast.definitions
            .map(definition => {
                if (KINDS.indexOf(definition.kind) > -1) {
                    if (
                        definition.kind === Kind.OBJECT_TYPE_DEFINITION ||
                        definition.kind === Kind.INTERFACE_TYPE_DEFINITION ||
                        definition.kind === Kind.ENUM_TYPE_DEFINITION ||
                        definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION
                    ) {
                        const name = definition.name.value;

                        const dependences = Array.isArray(definition.fields) ? uniq(definition.fields.reduce((total, field) => {
                            checkComment(field);

                            const names = Array.isArray(field.arguments) ? field.arguments.reduce((total, argument) => {
                                checkComment(argument);

                                const name = findName(argument.type);
                                return !isSpecifiedScalarType(name) && name !== definition.name.value ? [...total, name] : total;
                            }, []) : [];

                            total = [...total, ...names];

                            const name = findName(field.type);

                            return !isSpecifiedScalarType(name) && name !== definition.name.value ? [...total, name] : total;
                        }, [])) : [];

                        checkComment(definition);

                        const comment = recurseComments(definition.loc.startToken.prev);

                        const def = (comment.length ? `${comment.reverse().join('\n')}\n ` : '') + definition.loc.source.body.slice(definition.loc.start, definition.loc.end);

                        this.definitions.push({name, dependences, def});

                        const objectAstNode = types.objectExpression([
                            types.objectProperty(types.Identifier('name'), types.stringLiteral(name)),
                            types.objectProperty(types.Identifier('dependences'), types.arrayExpression(dependences.map(name => types.Identifier(name)))),
                            types.objectProperty(types.identifier('def'), types.stringLiteral(def)),
                            types.objectProperty(types.identifier('resolver'), types.objectExpression([
                                types.objectProperty(types.Identifier(name), types.objectExpression([]))
                            ])),
                            types.objectProperty(types.identifier('addResolver'), types.functionExpression(
                                types.identifier(''),
                                [types.identifier('resolver')],
                                types.blockStatement([gen2()])
                            ))
                        ]);

                        return types.variableDeclaration('const', [types.variableDeclarator(types.identifier(name), objectAstNode)]);
                    }
                    else {
                        throw new Error(`Please make ${definition.kind} in JavaScript File!`);
                    }
                }
            })
            .filter(node => !!node);

        const requireAstNodes = uniq(this.definitions.reduce((total, definition) => [...total, ...definition.dependences], []))
            .map(name => {
                if (!this.manifest[name] && specifiers.indexOf(name) < 0) {
                    throw new Error(`Must provide the Graphql definition of '${name}' in some file named like 'types.manifest.json' or just in current file.`);
                }

                if (this.manifest[name]) {
                    let PATH = nodePath.relative(nodePath.dirname(reference), this.manifest[name]);

                    if (!PATH.startsWith('.')) {
                        PATH = `./${PATH}`;
                    }

                    return gen1({
                        NAME: types.identifier(name),
                        PATH: types.stringLiteral(PATH)
                    });
                } else {
                    return undefined;
                }
            })
            .filter(node => !!node);

        path.replaceWithMultiple([...requireAstNodes, ...variableAstNodes]);

        this.manifest = {};
        this.definitions = [];
    }

    constructor() {
        this.manifest = {};

        this.definitions = [];
    }
};