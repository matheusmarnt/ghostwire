<?php

// tests/Browser/Fixtures/Legacy/LegacyWidgetTwo.php

namespace Ghostwire\Tests\Browser\Fixtures\Legacy;

class LegacyWidgetTwo extends LegacyBaseComponent
{
    public function render()
    {
        return view('ghostwire-fixtures::legacy.legacy-widget-two');
    }

    public function refreshBadge(): void {}
}
