<?php

return [
    'enabled' => env('GHOSTWIRE_ENABLED', true),

    // 'opt-in' -> only elements with wire:ghost or components with #[Ghost]
    // 'global' -> every Livewire component, unless opted out
    'strategy' => 'opt-in',

    'mode' => 'synthesize',

    'timing' => [
        'delay' => 120,
        'hold' => 300,
        'timeout' => 15000,
    ],

    'silence' => [
        'poll' => true,
        'sync' => true,
    ],

    'synthesis' => [
        'max_depth' => 12,
        'max_bones' => 300,
        'repeat_sample_size' => 3,
    ],

    'learning' => [
        'enabled' => env('GHOSTWIRE_LEARNING', false),
        'store' => 'local',
    ],
];
