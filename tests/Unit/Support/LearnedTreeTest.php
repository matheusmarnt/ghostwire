<?php

use Ghostwire\Support\LearnedTree;
use Ghostwire\Support\ViewportBands;

// Ruling A: store.js and LearnedTree.php re-implement the same rules by hand on
// each side of the language boundary, and cannot share code across it. A
// hand-written duplicate-value test only catches drift if someone remembers to
// update it too, so these read the JS source directly instead - the same
// technique js/tests/learning-store.test.js already uses to keep store.js and
// emit.js in sync (see its "keeps BONE_TYPES a superset..." and "keeps store.js's
// bone key set in sync..." tests). A constant changed on only one side fails
// here immediately instead of silently diverging.
function jsLearningSource(string $file): string
{
    return file_get_contents(__DIR__.'/../../../js/src/learning/'.$file);
}

function treeEnvelope(array $bones, array $entryOverrides = []): string
{
    return json_encode([
        'v' => 1,
        'e' => ['1|lg' => array_merge([
            't' => 1,
            'n' => 'orders-table',
            'w' => 100,
            'h' => 50,
            'b' => $bones,
        ], $entryOverrides)],
        'c' => ['orders-table|lg' => '1'],
    ]);
}

it('keeps ViewportBands::NAMES in sync with bands.js', function () {
    preg_match('/BAND_NAMES = \[([^\]]+)\]/', jsLearningSource('bands.js'), $match);
    expect($match)->not->toBeEmpty();

    $names = array_map(fn (string $s) => trim(trim($s), "'"), explode(',', $match[1]));

    expect($names)->toBe(ViewportBands::NAMES);
});

it("keeps LearnedTree's numeric limits in sync with store.js (Ruling A)", function () {
    $src = jsLearningSource('store.js');

    preg_match('/SCHEMA_VERSION = (\d+)/', $src, $version);
    preg_match('/MAX_COORD = (\d+)/', $src, $maxCoord);
    preg_match('/MAX_BONES = (\d+)/', $src, $maxBones);

    // Finding 7: without this, a renamed JS constant surfaces as "Undefined
    // array key 1" instead of a clean, legible assertion failure - exactly the
    // wrong failure mode for a test whose whole job is reporting drift clearly.
    expect($version)->not->toBeEmpty()
        ->and($maxCoord)->not->toBeEmpty()
        ->and($maxBones)->not->toBeEmpty();

    expect((int) $version[1])->toBe(LearnedTree::SCHEMA_VERSION)
        ->and((int) $maxCoord[1])->toBe(LearnedTree::MAX_COORD)
        ->and((int) $maxBones[1])->toBe(LearnedTree::MAX_BONES);
});

it("keeps LearnedTree::MAX_TIMESTAMP in sync with store.js's clamp ceiling (Ruling A / Finding 5)", function () {
    // Number.MAX_SAFE_INTEGER is a JS language builtin, not a store.js-defined
    // constant, so there's no "NAME = number" line to extract - pin the call
    // site instead, and check the PHP constant against the exact mathematical
    // value (2**53 - 1) that builtin equals.
    expect(jsLearningSource('store.js'))->toContain('clamp(entry.t, 0, Number.MAX_SAFE_INTEGER)');
    expect(LearnedTree::MAX_TIMESTAMP)->toBe(2 ** 53 - 1);
});

it("keeps LearnedTree::BONE_TYPES in sync with store.js's whitelist (Ruling A)", function () {
    preg_match('/BONE_TYPES = new Set\(\[([^\]]+)\]\)/', jsLearningSource('store.js'), $match);
    expect($match)->not->toBeEmpty();

    $jsTypes = array_map(fn (string $s) => trim(trim($s), "'"), explode(',', $match[1]));
    sort($jsTypes);

    $phpTypes = LearnedTree::BONE_TYPES;
    sort($phpTypes);

    expect($phpTypes)->toBe($jsTypes);
});

it('keeps LearnedTree::NAME_PATTERN in sync with store.js (Ruling A)', function () {
    // Finding 3: LearnedTree::NAME_PATTERN carries a trailing D modifier that
    // store.js's regex literal has no equivalent syntax for - compare the
    // pattern body only, so a real body drift can't hide behind an unrelated
    // modifier-length mismatch (and the modifier's absence can't fake a pass).
    $body = substr(LearnedTree::NAME_PATTERN, 0, strrpos(LearnedTree::NAME_PATTERN, '/') + 1);

    expect(jsLearningSource('store.js'))->toContain('NAME_PATTERN = '.$body);

    // The alarm's own blind spot, found by the 2026-09-12 audit: it compared one JS
    // file against PHP while three independent hand-written copies existed, so two
    // could drift undetected. Assert the population, not just one member — a fourth
    // copy appearing anywhere in js/src/ fails this.
    //
    // Counting bare '{1,64}' occurrences would also catch attributeConfig.js's
    // unrelated ACTION_NAME_PATTERN (/^[A-Za-z0-9_]{1,64}$/ - a different charset,
    // for action names, not component names) and false-positive against legitimate
    // code. Count occurrences of $body itself instead - the exact regex-literal
    // text (delimiters included) that only a real copy of THIS charset can contain.
    $jsSources = array_merge(
        glob(__DIR__.'/../../../js/src/*.js'),
        glob(__DIR__.'/../../../js/src/*/*.js'),
    );

    expect(count($jsSources))->toBe(17, 'the glob must reach every js/src module, including nested ones — a glob that matches nothing would make the count below pass vacuously');

    $copies = 0;
    foreach ($jsSources as $file) {
        $copies += substr_count((string) file_get_contents($file), $body);
    }

    expect($copies)->toBe(1, 'the component-name charset must have exactly one definition in js/src/; import it, do not re-spell it');
});

it('rejects a name with a trailing newline (Finding 3: PCRE $ needs /D for JS parity)', function () {
    // Without PCRE's D (PCRE_DOLLAR_ENDONLY) modifier, $ also matches
    // immediately before a trailing "\n" - so "orders-table\n" would pass
    // PHP's gate while JS's identically-written /^[a-z0-9\-.]{1,64}$/ (whose $
    // has no such leniency without the unset `m` flag) rejects it. Exactly the
    // kind of divergence a text-only parity comparison cannot catch, which is
    // why it's asserted here as actual behavior instead.
    expect(preg_match(LearnedTree::NAME_PATTERN, "orders-table\n"))->toBe(0);
});

it('accepts a component name at exactly 64 characters and rejects 65 (Ruling C)', function () {
    expect(preg_match(LearnedTree::NAME_PATTERN, str_repeat('a', 64)))->toBe(1)
        ->and(preg_match(LearnedTree::NAME_PATTERN, str_repeat('a', 65)))->toBe(0);
});

it('rejects a bone carrying a sixth key, so nothing smuggled survives', function () {
    $json = treeEnvelope([
        ['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10, 'onclick' => 'alert(1)'],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->toBeNull();
});

it('rejects a bone missing one of the five required keys', function () {
    $json = treeEnvelope([
        ['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 10], // no height
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->toBeNull();
});

it('accepts a panel bone carrying a valid borderRadius', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '8px'],
    ]);

    $result = LearnedTree::fromJson($json, 'orders-table', 'lg');

    expect($result)->not->toBeNull()
        ->and($result['bones'][0])->toBe([
            'type' => 'panel', 'x' => 0.0, 'y' => 0.0, 'width' => 200.0, 'height' => 100.0, 'borderRadius' => '8px',
        ]);
});

it('accepts a panel bone with no borderRadius, using just the five base keys', function () {
    // The common case: most panels have no rounded corner at all.
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->not->toBeNull();
});

it('accepts a multi-corner borderRadius (up to 4 space-separated tokens)', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '8px 4px 8px 4px'],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->not->toBeNull();
});

it('rejects a panel bone whose borderRadius does not match the strict pattern', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '8px" onmouseover="alert(1)'],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->toBeNull();
});

it('accepts a panel bone with scientific notation borderRadius (positive exponent)', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '3.35544e+07px'],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->not->toBeNull();
});

it('accepts a panel bone with scientific notation borderRadius (negative exponent)', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '1.5e-3px'],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->not->toBeNull();
});

it('accepts a panel bone with scientific notation borderRadius (unsigned exponent)', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '1.5e3px'],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->not->toBeNull();
});

it('rejects injection payloads using exponent-like syntax with prohibited characters', function () {
    $json1 = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '1e"onmouseover="alert(1)px'],
    ]);
    expect(LearnedTree::fromJson($json1, 'orders-table', 'lg'))->toBeNull();

    $json2 = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '1e<svg>px'],
    ]);
    expect(LearnedTree::fromJson($json2, 'orders-table', 'lg'))->toBeNull();

    $json3 = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '1e;javascript:alert(1)px'],
    ]);
    expect(LearnedTree::fromJson($json3, 'orders-table', 'lg'))->toBeNull();
});

it('accepts a boneTree with multiple panel bones carrying scientific notation borderRadius', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 24, 'height' => 24, 'borderRadius' => '3.35544e+07px'],
        ['type' => 'panel', 'x' => 30, 'y' => 0, 'width' => 24, 'height' => 24, 'borderRadius' => '9.99999e+06px'],
        ['type' => 'text', 'x' => 60, 'y' => 5, 'width' => 100, 'height' => 14],
    ]);

    $result = LearnedTree::fromJson($json, 'orders-table', 'lg');
    expect($result)->not->toBeNull()
        ->and($result['bones'])->toHaveCount(3);
});

it('rejects a panel bone whose borderRadius is not a string', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => 8],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->toBeNull();
});

it('rejects a panel bone carrying a seventh key beyond the five base keys plus borderRadius', function () {
    $json = treeEnvelope([
        ['type' => 'panel', 'x' => 0, 'y' => 0, 'width' => 200, 'height' => 100, 'borderRadius' => '8px', 'onclick' => 'alert(1)'],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->toBeNull();
});

it('rejects an entry whose bones array is empty', function () {
    expect(LearnedTree::fromJson(treeEnvelope([]), 'orders-table', 'lg'))->toBeNull();
});

it('accepts exactly MAX_BONES bones', function () {
    $bones = array_fill(0, LearnedTree::MAX_BONES, ['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 1, 'height' => 1]);

    $result = LearnedTree::fromJson(treeEnvelope($bones), 'orders-table', 'lg');

    expect($result)->not->toBeNull()
        ->and($result['bones'])->toHaveCount(LearnedTree::MAX_BONES);
});

it('rejects one more than MAX_BONES bones', function () {
    $bones = array_fill(0, LearnedTree::MAX_BONES + 1, ['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 1, 'height' => 1]);

    expect(LearnedTree::fromJson(treeEnvelope($bones), 'orders-table', 'lg'))->toBeNull();
});

it('clamps bone coordinates at the boundary in both directions', function () {
    $json = treeEnvelope([
        ['type' => 'text', 'x' => -25000, 'y' => 25000, 'width' => -100, 'height' => 25000],
        ['type' => 'text', 'x' => -20000, 'y' => 20000, 'width' => 0, 'height' => 20000],
    ]);

    $result = LearnedTree::fromJson($json, 'orders-table', 'lg');

    expect($result['bones'][0])->toBe(['type' => 'text', 'x' => -20000.0, 'y' => 20000.0, 'width' => 0.0, 'height' => 20000.0])
        ->and($result['bones'][1])->toBe(['type' => 'text', 'x' => -20000.0, 'y' => 20000.0, 'width' => 0.0, 'height' => 20000.0]);
});

it('returns null when the component is learned at a different band', function () {
    // Only "orders-table|lg" is indexed - asking for the same component at "sm"
    // must miss, not fall back to whatever tree happens to exist elsewhere.
    $json = treeEnvelope([['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10]]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'sm'))->toBeNull();
});

it('rejects an entry whose name does not match the requested component', function () {
    // Guards the lookup itself: fromJson() trusts the `c` pointer for an O(1)
    // lookup instead of rebuilding it from validated entries the way store.js's
    // validEnvelope() does, so it must independently confirm the entry it lands
    // on actually is the requested component, not just whatever sits at that key.
    $json = treeEnvelope([['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10]], ['n' => 'someone-else']);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->toBeNull();
});

it('rejects an entry whose t is not a finite number (Ruling A / Finding 5)', function () {
    // store.js's validEntry() clamps t and discards the whole entry when that
    // clamp fails (Number.isFinite(t) === false) - fromJson() previously never
    // looked at t at all, so a non-numeric one slipped straight through.
    $json = treeEnvelope([['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10]], ['t' => 'NOPE']);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->toBeNull();
});

it('rejects a c-pointer signature that is not 1-10 decimal digits (Ruling A / Finding 5)', function () {
    // store.js's ENTRY_KEY_PATTERN (\d{1,10}) gates every key of `e` as it
    // rebuilds `c` from scratch, so a signature outside that shape can never
    // exist in a `c` store.js itself produced. fromJson() trusts a raw `c`
    // instead (Ruling A, row 12), so it must enforce the same shape by hand.
    // The entry below is otherwise completely valid and sits at exactly the
    // key this 11-digit signature points to, so this fails for the RIGHT
    // reason only if the shape check itself rejects it - not because the
    // lookup simply misses.
    $json = json_encode([
        'v' => 1,
        'e' => ['12345678901|lg' => ['t' => 1, 'n' => 'orders-table', 'w' => 10, 'h' => 10, 'b' => [
            ['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 1, 'height' => 1],
        ]]],
        'c' => ['orders-table|lg' => '12345678901'],
    ]);

    expect(LearnedTree::fromJson($json, 'orders-table', 'lg'))->toBeNull();
});

it("discards unparseable JSON without throwing (mirrors learning-store.test.js's \"discards unparseable JSON silently\", Finding 8)", function () {
    expect(fn () => LearnedTree::fromJson('}{ not json', 'orders-table', 'lg'))->not->toThrow(Throwable::class);
    expect(LearnedTree::fromJson('}{ not json', 'orders-table', 'lg'))->toBeNull();
});

it('discards a JSON root that decodes to something other than an object (Finding 8)', function () {
    expect(LearnedTree::fromJson('[1,2,3]', 'orders-table', 'lg'))->toBeNull()
        ->and(LearnedTree::fromJson('"hello"', 'orders-table', 'lg'))->toBeNull()
        ->and(LearnedTree::fromJson('42', 'orders-table', 'lg'))->toBeNull()
        ->and(LearnedTree::fromJson('null', 'orders-table', 'lg'))->toBeNull();
});

it('emits fully static markup with no Blade echo and no PHP tag', function () {
    $blade = LearnedTree::toBlade([
        'width' => 100.0,
        'height' => 50.0,
        'bones' => [['type' => 'text', 'x' => 1.0, 'y' => 2.0, 'width' => 3.0, 'height' => 4.0]],
    ]);

    // Finding 6: '<?' alone subsumes '<?php' and '<?=', and a bare '@'
    // subsumes every Blade directive, present or future.
    expect($blade)->not->toContain('{{')
        ->and($blade)->not->toContain('{!!')
        ->and($blade)->not->toContain('<?')
        ->and($blade)->not->toContain('@')
        ->and($blade)->toContain('gw-bone gw-bone--text');
});

it('emits a border-radius inline style for a bone that carries one, still with no dynamic markup', function () {
    $blade = LearnedTree::toBlade([
        'width' => 100.0,
        'height' => 50.0,
        'bones' => [['type' => 'panel', 'x' => 1.0, 'y' => 2.0, 'width' => 3.0, 'height' => 4.0, 'borderRadius' => '8px']],
    ]);

    expect($blade)->toContain('gw-bone gw-bone--panel')
        ->and($blade)->toContain('border-radius:8px')
        ->and($blade)->not->toContain('{{')
        ->and($blade)->not->toContain('{!!')
        ->and($blade)->not->toContain('<?')
        ->and($blade)->not->toContain('@');
});

it('omits the border-radius style entirely for a bone with none', function () {
    $blade = LearnedTree::toBlade([
        'width' => 100.0,
        'height' => 50.0,
        'bones' => [['type' => 'text', 'x' => 1.0, 'y' => 2.0, 'width' => 3.0, 'height' => 4.0]],
    ]);

    expect($blade)->not->toContain('border-radius');
});

it('formats geometry with a locale-independent decimal point (Finding 4)', function () {
    $original = setlocale(LC_NUMERIC, '0');
    setlocale(LC_NUMERIC, 'de_DE.UTF-8', 'de_DE', 'de_DE.utf8');

    try {
        // setlocale()'s RETURN VALUE is not evidence that the locale took
        // effect: glibc hands back the requested name even when that locale was
        // never generated, leaving decimal_point at '.'. Guarding on it — as
        // this test first did — made both assertions below pass against '%.2f'
        // and '%.2F' alike, so it proved nothing on any machine without a
        // German locale installed, which is most of them. Ask the only question
        // that actually matters: did the separator become a comma?
        if (localeconv()['decimal_point'] !== ',') {
            $this->markTestSkipped(
                'no comma-decimal locale installed - run `sudo locale-gen de_DE.UTF-8`. '
                .'CI generates it and asserts this same condition before running the suite, '
                .'so this can never skip where it counts.'
            );
        }

        $blade = LearnedTree::toBlade(['width' => 12.0, 'height' => 5.0, 'bones' => []]);

        expect($blade)->toContain('width:12.00px')
            ->and($blade)->not->toContain('width:12,00px');
    } finally {
        setlocale(LC_NUMERIC, $original);
    }
});
