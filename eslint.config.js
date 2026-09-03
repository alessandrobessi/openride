import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		}
	},
	{
		// Headless-first simulation core (plan): everything under simulation/ except
		// simulation/physics/ must compute forces from state + config only — no
		// Three.js, no Rapier, no SvelteKit, no rendering imports — so it runs in
		// Node tests.
		files: ['src/lib/simulation/**/*.ts'],
		ignores: ['src/lib/simulation/physics/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{ name: 'three', message: 'Keep Three.js in rendering/; simulation/* is headless.' },
						{
							name: '@dimforge/rapier3d-compat',
							message: 'Only simulation/physics/* may import Rapier.'
						}
					],
					patterns: [
						{
							group: ['three/*', '$app/*', '$lib/rendering/*', '$lib/simulation/physics/*'],
							message:
								'simulation/* (non-physics) must not depend on Rapier, Three.js, SvelteKit or rendering.'
						}
					]
				}
			]
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'package/',
			'test-results/',
			'playwright-report/',
			'pnpm-lock.yaml'
		]
	}
);
