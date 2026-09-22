<?php

// src/Support/LearnedTree.php

namespace Ghostwire\Support;

/**
 * Server-side re-validation of the learned-tree envelope produced by
 * Ghostwire.exportLearned() in the browser, plus the static-Blade emitter.
 *
 * The file arrives from a developer's own download directory, so it is treated as
 * untrusted input: every rule the JS store enforces on read is enforced again
 * here (integrity rules, sanitized numeric dimensions and no learned data
 * interpolated as markup).
 *
 * This mirrors js/src/learning/store.js's validBone()/validEntry()/validEnvelope()
 * independently, by hand - the two cannot share code across the language
 * boundary. Keep the constants and clamps below in sync with that file; it
 * carries a comment pointing back here for the same reason.
 */
final class LearnedTree
{
    public const SCHEMA_VERSION = 1;

    public const MAX_COORD = 20000;

    public const MAX_BONES = 300;

    public const BONE_TYPES = ['text', 'avatar', 'block', 'icon', 'media', 'control', 'heading', 'panel'];

    // JS's Number.MAX_SAFE_INTEGER (2**53 - 1) - the ceiling store.js's
    // validEntry() clamps the learned-at timestamp to (Finding 5).
    public const MAX_TIMESTAMP = 9007199254740991;

    // Finding 3: the trailing D (PCRE_DOLLAR_ENDONLY) modifier is required for
    // parity with JS's $ (no `m` flag). Without it, PCRE's $ ALSO matches
    // immediately before a trailing "\n" - so "orders-table\n" would pass this
    // gate while store.js's identically-written /^[a-z0-9\-.]{1,64}$/ (whose $
    // has no such leniency) rejects it. A text-only comparison of the two
    // patterns cannot see this; see the behavioral test next to the parity
    // test in tests/Unit/Support/LearnedTreeTest.php.
    public const NAME_PATTERN = '/^[a-z0-9\-.]{1,64}$/D';

    // Mirrors store.js's BORDER_RADIUS_PATTERN. A real space, not \s - real
    // getComputedStyle(el).borderRadius output only ever separates multi-corner
    // tokens with a plain ASCII space, so \s's extra leniency (tab, newline...)
    // is unneeded slack in a pattern validating untrusted input. The trailing D
    // modifier is required for the same reason NAME_PATTERN carries one (see
    // above): without it, PCRE's $ also matches immediately before a trailing
    // "\n", which JS's $ (no `m` flag) does not.
    public const BORDER_RADIUS_PATTERN = '/^\d+(\.\d+)?(px|%|em|rem)( \d+(\.\d+)?(px|%|em|rem)){0,3}$/D';

    /**
     * @return array{width: float, height: float, bones: array<int, array{type: string, x: float, y: float, width: float, height: float, borderRadius?: string}>}|null
     */
    public static function fromJson(string $json, string $component, string $band): ?array
    {
        $parsed = json_decode($json, true);

        if (! is_array($parsed) || ($parsed['v'] ?? null) !== self::SCHEMA_VERSION) {
            return null;
        }

        if (! is_array($parsed['e'] ?? null) || ! is_array($parsed['c'] ?? null)) {
            return null;
        }

        $signature = $parsed['c'][$component.'|'.$band] ?? null;

        // Finding 5: store.js's ENTRY_KEY_PATTERN (\d{1,10}) gates every key of
        // `e` as validEnvelope() rebuilds `c` from scratch, so a signature
        // outside that shape can never exist in a `c` store.js itself produced.
        // fromJson() trusts a raw `c` instead (Ruling A, row 12: an O(1) single
        // lookup, not a full rebuild), so it must enforce the same shape itself.
        if ((! is_string($signature) && ! is_int($signature)) || ! preg_match('/^\d{1,10}$/', (string) $signature)) {
            return null;
        }

        $entry = $parsed['e'][$signature.'|'.$band] ?? null;

        if (! is_array($entry) || ($entry['n'] ?? null) !== $component) {
            return null;
        }

        if (! is_array($entry['b'] ?? null) || $entry['b'] === [] || count($entry['b']) > self::MAX_BONES) {
            return null;
        }

        // Finding 5: store.js's validEntry() also clamps `t` and discards the
        // whole entry when that clamp fails. Not returned - nothing downstream
        // reads it - but a malformed one must still poison the entry the same
        // way it does on the JS side, or the two copies silently diverge here.
        if (self::clamp($entry['t'] ?? null, 0, self::MAX_TIMESTAMP) === null) {
            return null;
        }

        $bones = [];

        foreach ($entry['b'] as $bone) {
            $valid = self::validBone($bone);

            if ($valid === null) {
                return null; // one bad bone discards the whole entry
            }

            $bones[] = $valid;
        }

        $width = self::clamp($entry['w'] ?? null, 0, self::MAX_COORD);
        $height = self::clamp($entry['h'] ?? null, 0, self::MAX_COORD);

        if ($width === null || $height === null) {
            return null;
        }

        return ['width' => $width, 'height' => $height, 'bones' => $bones];
    }

    /**
     * $entry is expected to already be validBone()-validated output (fromJson()'s
     * return, typically) - the 5 required keys plus optional borderRadius are this
     * method's real precondition, not just documentation.
     *
     * @param  array{width: float, height: float, bones: array<int, array{type: string, x: float, y: float, width: float, height: float, borderRadius?: string}>}  $entry
     */
    public static function toBlade(array $entry): string
    {
        $lines = [
            // Plain HTML comments, not {{-- Blade --}} ones: a Blade comment's own
            // delimiter starts with the literal characters "{{", which is exactly
            // the Blade-echo token this file must contain zero occurrences of.
            // HTML comments carry no such token and still compile
            // through Blade untouched.
            '<!-- Generated by `php artisan ghost:export`. Static Blade, no dynamic values. -->',
            '<!-- Regenerate rather than editing this by hand. -->',
            sprintf(
                // %F, not %f (Finding 4): %f is locale-aware, so under an
                // LC_NUMERIC using a comma decimal separator this would emit
                // "width:12,00px" and silently break the placeholder geometry.
                '<div class="gw-lazy" aria-hidden="true" style="position:relative;width:%.2Fpx;height:%.2Fpx">',
                $entry['width'],
                $entry['height'],
            ),
        ];

        foreach ($entry['bones'] as $bone) {
            $style = sprintf(
                'position:absolute;left:%.2Fpx;top:%.2Fpx;width:%.2Fpx;height:%.2Fpx',
                $bone['x'],
                $bone['y'],
                $bone['width'],
                $bone['height'],
            );

            // Safe to interpolate this string directly (unlike the numeric
            // fields above, which all go through %.2F): by the time a bone
            // reaches here it already passed validBone()'s BORDER_RADIUS_PATTERN
            // match, which restricts the value to digits, an optional decimal
            // point, spaces, and the literal unit words px/%/em/rem - no quote,
            // angle-bracket or other character that could close the style
            // attribute or inject markup can survive that gate. Read only from
            // this already-validated $bone, never re-derived from raw input.
            if (isset($bone['borderRadius'])) {
                $style .= sprintf(';border-radius:%s', $bone['borderRadius']);
            }

            $lines[] = sprintf(
                '    <div class="gw-bone gw-bone--%s" style="%s"></div>',
                $bone['type'],   // already restricted to self::BONE_TYPES
                $style,
            );
        }

        $lines[] = '</div>';

        return implode("\n", $lines)."\n";
    }

    /**
     * @return array{type: string, x: float, y: float, width: float, height: float, borderRadius?: string}|null
     */
    private static function validBone(mixed $bone): ?array
    {
        if (! is_array($bone)) {
            return null;
        }

        $keys = array_keys($bone);
        sort($keys);

        // Whatever isn't the 5 required keys must be exactly the one
        // recognized optional key (borderRadius) - anything else (a typo, a
        // smuggled field) is rejected outright rather than silently dropped,
        // mirroring store.js's validBone().
        $hasBorderRadius = in_array('borderRadius', $keys, true);
        $expectedKeys = $hasBorderRadius
            ? ['borderRadius', 'height', 'type', 'width', 'x', 'y']
            : ['height', 'type', 'width', 'x', 'y'];

        if ($keys !== $expectedKeys) {
            return null;
        }

        if (! is_string($bone['type']) || ! in_array($bone['type'], self::BONE_TYPES, true)) {
            return null;
        }

        $x = self::clamp($bone['x'], -self::MAX_COORD, self::MAX_COORD);
        $y = self::clamp($bone['y'], -self::MAX_COORD, self::MAX_COORD);
        $width = self::clamp($bone['width'], 0, self::MAX_COORD);
        $height = self::clamp($bone['height'], 0, self::MAX_COORD);

        if ($x === null || $y === null || $width === null || $height === null) {
            return null;
        }

        $valid = ['type' => $bone['type'], 'x' => $x, 'y' => $y, 'width' => $width, 'height' => $height];

        if ($hasBorderRadius) {
            if (! is_string($bone['borderRadius']) || ! preg_match(self::BORDER_RADIUS_PATTERN, $bone['borderRadius'])) {
                return null;
            }

            $valid['borderRadius'] = $bone['borderRadius'];
        }

        return $valid;
    }

    private static function clamp(mixed $value, float $min, float $max): ?float
    {
        if (! is_int($value) && ! is_float($value)) {
            return null;
        }

        if (is_nan((float) $value) || is_infinite((float) $value)) {
            return null;
        }

        return min($max, max($min, (float) $value));
    }
}
