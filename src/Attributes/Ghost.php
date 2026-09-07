<?php
// src/Attributes/Ghost.php
namespace Ghostwire\Attributes;

use Attribute;

#[Attribute(Attribute::TARGET_CLASS | Attribute::TARGET_METHOD)]
final class Ghost
{
    /**
     * @param  'synthesize'|'freeze'|'off'  $mode
     * @param  array<int, string>|null  $only    Actions that activate the ghost.
     * @param  array<int, string>|null  $except  Actions that never activate it.
     * @param  int|null  $delay   Milliseconds before the ghost appears.
     * @param  int|null  $hold    Minimum visible duration in milliseconds.
     * @param  int|null  $rows    Repeat hint used when the host renders empty.
     * @param  bool  $poll        Allow polled messages to activate the ghost.
     * @param  bool  $sync        Allow property-only messages to activate it.
     * @param  bool  $lazy        Reuse the learned tree as the lazy placeholder.
     */
    public function __construct(
        public string $mode = 'synthesize',
        public ?array $only = null,
        public ?array $except = null,
        public ?int $delay = null,
        public ?int $hold = null,
        public ?int $rows = null,
        public bool $poll = false,
        public bool $sync = false,
        public bool $lazy = false,
    ) {}
}
