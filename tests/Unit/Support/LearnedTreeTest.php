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

it('keeps ViewportBands::NAMES in sync with bands.js (SPEC-SEC-05 constraint 9)', function () {
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

    expect((int) $version[1])->toBe(LearnedTree::SCHEMA_VERSION)
        ->and((int) $maxCoord[1])->toBe(LearnedTree::MAX_COORD)
        ->and((int) $maxBones[1])->toBe(LearnedTree::MAX_BONES);
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
    expect(jsLearningSource('store.js'))->toContain('NAME_PATTERN = '.LearnedTree::NAME_PATTERN);
});

it('accepts a component name at exactly 64 characters and rejects 65 (Ruling C)', function () {
    expect(preg_match(LearnedTree::NAME_PATTERN, str_repeat('a', 64)))->toBe(1)
        ->and(preg_match(LearnedTree::NAME_PATTERN, str_repeat('a', 65)))->toBe(0);
});

it('rejects a bone carrying a sixth key, so nothing smuggled survives (SPEC-SEC-04)', function () {
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

it('clamps bone coordinates at the boundary in both directions (SPEC-SEC-05)', function () {
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

it('emits fully static markup with no Blade echo and no PHP tag (SPEC-SEC-05)', function () {
    $blade = LearnedTree::toBlade([
        'width' => 100.0,
        'height' => 50.0,
        'bones' => [['type' => 'text', 'x' => 1.0, 'y' => 2.0, 'width' => 3.0, 'height' => 4.0]],
    ]);

    expect($blade)->not->toContain('{{')
        ->and($blade)->not->toContain('<?php')
        ->and($blade)->not->toContain('@php')
        ->and($blade)->toContain('gw-bone gw-bone--text');
});
