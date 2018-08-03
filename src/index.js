import BabelGraphqlTransformer from './transformer';

export default function ({types}) {
    return new BabelGraphqlTransformer().start(types);
};