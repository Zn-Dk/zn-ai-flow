import eslint from '@eslint/js'
import tseslint, { type InfiniteDepthConfigWithExtends } from 'typescript-eslint'
import importSort from 'eslint-plugin-simple-import-sort'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import stylistic from '@stylistic/eslint-plugin'

const ignores = [
  'dist',
  'build',
  'eslint.config.js',
  'commitlint.config.js',
  '**/*.js',
  '**/*.mjs',
  '**/*.d.ts',
  '**/.out/**',
  '**/.next/**',
]

const commonCfg: InfiniteDepthConfigWithExtends = {
  ignores,
  plugins: {
    'simple-import-sort': importSort,
    '@stylistic': stylistic,
  },
  extends: [
    eslint.configs.recommended,
    tseslint.configs.recommended,
  ],
  rules: {
    '@stylistic/semi': ['error', 'never'],
    '@stylistic/no-extra-semi': 'error',
    'max-len': [
      'warn',
      {
        code: 120,
        // 忽略 URL, 正则, 模板字符串
        ignoreUrls: true,
        ignoreRegExpLiterals: true,
        ignoreTemplateLiterals: true,
        // 忽略 import 语句
        ignorePattern: '^import\\s*(type)?\\s*\\w+\\sfrom',
      },
    ],
    // 不检查箭头函数体的风格
    '@stylistic/arrow-body-style': 'off',
    // 函数参数: 要么全在一行，要么全换行
    '@stylistic/function-paren-newline': ['error', 'multiline-arguments'],
    // 数组: 全在一行 / 换行: 元素与方括号之间换行, 元素之间换行
    '@stylistic/array-bracket-newline': ['error', { multiline: true }],
    '@stylistic/array-element-newline': ['error', 'consistent'],
    // 对象属性: 要么全在一行, 要么每个属性都换行
    '@stylistic/object-property-newline': [
      'error',
      { allowAllPropertiesOnSameLine: true },
    ],
    // 属性与花括号之间换行
    '@stylistic/object-curly-newline': [
      'error',
      {
        // 定义对象、对象解构、模块引入和模块导出，
        // 大于 3 个属性必须换行, 少于 3 个属性两者兼可
        ObjectExpression: {
          multiline: true,
          consistent: true,
          minProperties: 4,
        },
        ObjectPattern: {
          multiline: true,
          consistent: true,
          minProperties: 4,
        },
        ImportDeclaration: {
          multiline: false,
          consistent: true,
          minProperties: 4,
        },
        ExportDeclaration: {
          multiline: true,
          consistent: true,
          minProperties: 4,
        },
      },
    ],
    '@stylistic/object-curly-spacing': ['error', 'always'],
    // JSX 属性: 要么全在一行, 要么每个属性都换行
    '@stylistic/jsx-first-prop-new-line': ['error', 'multiline'],
    '@stylistic/jsx-max-props-per-line': [
      'error',
      { maximum: { single: 10, multi: 1 } },
    ],
    '@stylistic/no-multi-spaces': 'error',
    '@stylistic/brace-style': 'error',
    '@stylistic/comma-spacing': ['error', { before: false, after: true }],
    '@stylistic/function-call-spacing': ['error', 'never'],
    '@stylistic/indent': [
      'warn',
      2,
      {
        SwitchCase: 1,
        VariableDeclarator: 1,
        outerIIFEBody: 1,
        FunctionDeclaration: { parameters: 1, body: 1 },
        FunctionExpression: { parameters: 1, body: 1 },
        CallExpression: { arguments: 1 },
        MemberExpression: 1,
        flatTernaryExpressions: false,
        ignoreComments: false,
      },
    ],
    '@stylistic/keyword-spacing': [
      'error',
      {
        overrides: {
          if: { after: true },
          for: { after: true },
          while: { after: true },
        },
      },
    ],
    '@stylistic/quotes': ['warn', 'single', { allowTemplateLiterals: false }],
    '@stylistic/space-before-function-paren': [
      'error',
      { anonymous: 'always', named: 'never', asyncArrow: 'always' },
    ],
    '@stylistic/type-annotation-spacing': 'error',
    '@stylistic/array-bracket-spacing': ['error', 'never'],
    // ts: enum/interface/types 名称与花括号之前空格
    '@stylistic/block-spacing': 'error',
    // ts: 运算符与表达式必须空格
    '@stylistic/space-infix-ops': 'error',
    // ts: 隔行规则
    '@stylistic/padding-line-between-statements': [
      'warn',
      // interface/types 的声明之间必须空行
      {
        blankLine: 'always',
        prev: '*',
        next: ['export', 'interface', 'type'],
      },
    ],
  },
}

// 前端应用（workflow / webapp）
const frontendCfg: InfiniteDepthConfigWithExtends = {
  files: [
    'apps/workflow/**/*.{ts,tsx}',
    'apps/webapp/**/*.{ts,tsx}',
  ],
  plugins: { 'react-hooks': reactHooks },
  rules: { ...reactHooks.configs.recommended.rules },
}

// 后端应用（api-server）
const apiServerConfig: InfiniteDepthConfigWithExtends = {
  files: ['apps/api-server/**/*.{ts,tsx}'],
  extends: [...tseslint.configs.recommended],
  languageOptions: {
    ecmaVersion: 2020,
    globals: {
      ...globals.node,
    },
    parser: tseslint.parser,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    'no-explicit-any': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
  },
}

export default tseslint.config(
  commonCfg,
  frontendCfg,
  apiServerConfig,
)
