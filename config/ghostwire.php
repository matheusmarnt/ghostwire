<?php

return [
    'enabled' => env('GHOSTWIRE_ENABLED', true),

    // 'opt-in' -> only components with #[Ghost] (on the class, an ancestor, a
    //             trait, or an action method) — plus any element carrying the
    //             wire:ghost directive, which needs no server-side opt-in.
    // 'global'  -> every Livewire component, unless opted out with
    //             wire:ghost.off or #[Ghost(mode: 'off')].
    'strategy' => 'opt-in',

    'mode' => 'synthesize',

    'panels' => env('GHOSTWIRE_PANELS', false),

    'timing' => [
        'delay' => 120,
        'hold' => 300,
    ],

    'silence' => [
        'poll' => true,
        'sync' => true,
    ],

    'learning' => [
        'enabled' => env('GHOSTWIRE_LEARNING', false),
        'store' => 'local',
    ],
];
