<?php

// tests/Browser/Fixtures/Legacy/LegacyBaseComponent.php

namespace Ghostwire\Tests\Browser\Fixtures\Legacy;

use Ghostwire\Attributes\Ghost;
use Livewire\Component;

#[Ghost(except: ['refreshBadge'])]
abstract class LegacyBaseComponent extends Component {}
