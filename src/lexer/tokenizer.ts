import * as moo from 'moo';

import { TokenType } from '../core/token'; // convert to partial type import in TS 4.5
import {
	lineCommentRegex,
	operatorRegex,
	placeholderRegex,
	reservedWordRegex,
	StringPatternType,
	stringRegex,
	wordRegex,
} from '../core/mooRegexFactory';

interface TokenizerOptions {
	reservedKeywords: string[];
	reservedCommands: string[];
	reservedLogicalOperators: string[];
	reservedDependentClauses: string[];
	reservedBinaryCommands: string[];
	stringTypes: StringPatternType[];
	blockStart: string[];
	blockEnd: string[];
	indexedPlaceholderTypes?: string[];
	namedPlaceholderTypes: string[];
	lineCommentTypes: string[];
	specialWordChars?: { prefix?: string; any?: string; suffix?: string };
	operators?: string[];
}

export default class Tokenizer {
	LEXER_OPTIONS: { [key: string]: moo.Rule };
	LEXER: moo.Lexer;

	/**
	 * @param {TokenizerOptions} cfg
	 *  @param {String[]} cfg.reservedKeywords: Reserved words in SQL
	 *  @param {String[]} cfg.reservedDependentClauses: Words that following a specific Statement and must have data attached
	 *  @param {String[]} cfg.reservedLogicalOperators: Words that are set to newline
	 *  @param {String[]} cfg.reservedCommands: Words that are set to new line separately
	 *  @param {String[]} cfg.reservedBinaryCommands: Words that are top level but have no indentation
	 *  @param {String[]} cfg.stringTypes: String types to enable: "", '', ``, [], N''
	 *  @param {String[]} cfg.blockStart: Opening parentheses to enable, like (, [
	 *  @param {String[]} cfg.blockEnd: Closing parentheses to enable, like ), ]
	 *  @param {String[]} cfg.indexedPlaceholderTypes: Prefixes for indexed placeholders, like ?
	 *  @param {String[]} cfg.namedPlaceholderTypes: Prefixes for named placeholders, like @ and :
	 *  @param {String[]} cfg.lineCommentTypes: Line comments to enable, like # and --
	 *  @param {String[]} cfg.specialWordChars: Special chars that can be found inside of words, like @ and #
	 *  @param {String[]} cfg.operators: Additional operators to recognize
	 */
	constructor(cfg: TokenizerOptions) {
		const specialWordCharsAll = Object.values(cfg.specialWordChars ?? {}).join('');

		this.LEXER_OPTIONS = {
			WS: { match: /[ \t]+/ },
			NL: { match: /\n/, lineBreaks: true },
			[TokenType.BLOCK_COMMENT]: { match: /^(?:\/\*[^]*?(?:\*\/|$))/u, lineBreaks: true },
			[TokenType.LINE_COMMENT]: {
				match: lineCommentRegex(cfg.lineCommentTypes),
			},
			[TokenType.COMMA]: { match: /[,]/ },
			[TokenType.OPEN_PAREN]: { match: /[(]/ },
			[TokenType.CLOSE_PAREN]: { match: /[)]/ },
			[TokenType.OPEN_BRACKET]: { match: /[[]/ },
			[TokenType.CLOSE_BRACKET]: { match: /[\]]/ },
			[TokenType.OPERATOR]: {
				match: operatorRegex('+-/*%&|^><=.;{}`:$', [
					'<>',
					'<=',
					'>=',
					'!=',
					...(cfg.operators ?? []),
				]),
			},
			[TokenType.NUMBER]: {
				match:
					/^(?:(?:-\s*)?[0-9]+(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+(?:\.[0-9]+)?)?|0x[0-9a-fA-F]+|0b[01]+)\b/u,
			},
			[TokenType.CASE_START]: { match: /[Cc][Aa][Ss][Ee]/u },
			[TokenType.CASE_END]: { match: /[Ee][Nn][Dd]/u },
			[TokenType.RESERVED_COMMAND]: {
				match: reservedWordRegex(cfg.reservedCommands, specialWordCharsAll),
			},
			[TokenType.RESERVED_BINARY_COMMAND]: {
				match: reservedWordRegex(cfg.reservedBinaryCommands, specialWordCharsAll),
			},
			[TokenType.RESERVED_DEPENDENT_CLAUSE]: {
				match: reservedWordRegex(cfg.reservedDependentClauses, specialWordCharsAll),
			},
			[TokenType.RESERVED_LOGICAL_OPERATOR]: {
				match: reservedWordRegex(cfg.reservedLogicalOperators, specialWordCharsAll),
			},
			[TokenType.RESERVED_KEYWORD]: {
				match: reservedWordRegex(cfg.reservedKeywords, specialWordCharsAll),
			},
			INDEXED_PLACEHOLDER: { match: placeholderRegex(cfg.indexedPlaceholderTypes ?? [], '[0-9]*') },
			NAMED_PLACEHOLDER: { match: placeholderRegex(cfg.namedPlaceholderTypes, '[a-zA-Z0-9._$]+') },
			STRING_PLACEHOLDER: {
				match: placeholderRegex(
					cfg.namedPlaceholderTypes,
					stringRegex({ stringTypes: cfg.stringTypes }).source
				),
			},
			[TokenType.STRING]: { match: stringRegex({ stringTypes: cfg.stringTypes }) },
			[TokenType.WORD]: {
				match: wordRegex(cfg.specialWordChars),
				// type: moo.keywords({ [TokenType.RESERVED_COMMAND]: cfg.reservedCommands }), // case sensitivity currently broken, see moo#122
			},
		};

		this.LEXER_OPTIONS = Object.entries(this.LEXER_OPTIONS).reduce(
			(rules, [name, regex]) =>
				regex.match
					? {
							...rules,
							[name]: {
								...regex,
								match: new RegExp(
									regex.match as string | RegExp,
									[...(regex.match instanceof RegExp ? regex.match.flags.split('') : [])]
										.filter(flag => !'iumgy'.includes(flag)) // disallowed flags
										.join('') + 'u'
								),
							},
					  }
					: rules,
			{} as { [key: string]: moo.Rule }
		);

		this.LEXER = moo.compile(this.LEXER_OPTIONS);
	}

	tokenize(input: string) {
		this.LEXER.reset(input);
		return Array.from(this.LEXER);
	}
}
