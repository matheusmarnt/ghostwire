<?php

// tests/Browser/Fixtures/Legacy/LegacyWidgetFour.php

namespace Ghostwire\Tests\Browser\Fixtures\Legacy;

class LegacyWidgetFour extends LegacyBaseComponent
{
    public function render()
    {
        return view('ghostwire-fixtures::legacy.legacy-widget-four');
    }

    public function refreshBadge(): void {}
}
