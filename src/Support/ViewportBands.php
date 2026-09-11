<?php

// src/Support/ViewportBands.php

namespace Ghostwire\Support;

/**
 * The PHP mirror of js/src/learning/bands.js. Both lists must stay identical:
 * the JS side chooses the band a tree is stored under, and `ghost:export
 * --breakpoint` selects by the same name.
 */
final class ViewportBands
{
    public const NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

    public static function isValid(string $band): bool
    {
        return in_array($band, self::NAMES, true);
    }

    public static function list(): string
    {
        return implode(', ', self::NAMES);
    }
}
